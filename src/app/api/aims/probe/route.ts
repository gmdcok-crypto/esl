import { NextResponse } from "next/server";
import { AimsAuthError, getAimsAccessToken } from "@/lib/aims/auth";
import { getAimsApiBaseUrl, getEnv, isAimsConfigured } from "@/lib/config";

type ProbeResult = {
  name: string;
  url: string;
  status: number | null;
  ok: boolean;
  body: unknown;
};

async function probe(accessToken: string, name: string, url: string): Promise<ProbeResult> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });
    const text = await response.text();
    let body: unknown = text;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text.slice(0, 500);
      }
    }
    return { name, url, status: response.status, ok: response.ok, body };
  } catch (error) {
    return {
      name,
      url,
      status: null,
      ok: false,
      body: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET() {
  if (!isAimsConfigured()) {
    return NextResponse.json({ error: "AIMS not configured" }, { status: 503 });
  }

  try {
    const accessToken = await getAimsAccessToken();
    const env = getEnv();
    const apiBase = getAimsApiBaseUrl();
    const qs = new URLSearchParams({
      company: env.AIMS_COMPANY_CODE ?? "",
      store: env.AIMS_STORE_ID ?? "",
    }).toString();

    const results = await Promise.all([
      probe(accessToken, "Store", `${apiBase}/common/store?${qs}`),
      probe(accessToken, "Articles", `${apiBase}/common/articles?${qs}`),
      probe(accessToken, "Labels (Tag)", `${apiBase}/common/labels?${qs}`),
      probe(accessToken, "Gateway (Device)", `${apiBase}/common/gateway?${qs}`),
    ]);

    return NextResponse.json({
      authenticated: true,
      company: env.AIMS_COMPANY_CODE ?? null,
      store: env.AIMS_STORE_ID ?? null,
      summary: Object.fromEntries(results.map((r) => [r.name, r.status])),
      results,
    });
  } catch (error) {
    if (error instanceof AimsAuthError) {
      return NextResponse.json(
        { authenticated: false, error: error.message, details: error.body },
        { status: error.status },
      );
    }
    if (error instanceof Error) {
      return NextResponse.json({ authenticated: false, error: error.message }, { status: 500 });
    }
    throw error;
  }
}
