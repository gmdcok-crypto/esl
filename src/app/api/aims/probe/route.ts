import { NextResponse } from "next/server";
import { AimsAuthError, getAimsAccessToken } from "@/lib/aims/auth";
import { getAimsApiBaseUrl, getEnv, isAimsConfigured } from "@/lib/config";

type ProbeResult = {
  name: string;
  method: string;
  url: string;
  status: number | null;
  ok: boolean;
  body: unknown;
};

async function probe(
  accessToken: string,
  name: string,
  method: "GET" | "POST",
  url: string,
  companyCode?: string,
): Promise<ProbeResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(companyCode ? { "Company-Code": companyCode } : {}),
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

    return {
      name,
      method,
      url,
      status: response.status,
      ok: response.ok,
      body,
    };
  } catch (error) {
    return {
      name,
      method,
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
    const commonBase = getAimsApiBaseUrl();
    const utsBase = `${env.AIMS_BASE_URL.replace(/\/$/, "")}/uts/api/v2`;
    const storeId = env.AIMS_STORE_ID ?? "";
    const companyCode = env.AIMS_COMPANY_CODE;

    const qs = new URLSearchParams();
    if (storeId) {
      qs.set("storeId", storeId);
      qs.set("stationCode", storeId);
    }
    const query = qs.toString() ? `?${qs.toString()}` : "";

    const results = await Promise.all([
      probe(accessToken, "Store (common)", "GET", `${commonBase}/common/store${query}`, companyCode),
      probe(accessToken, "Store (uts)", "GET", `${utsBase}/common/store${query}`, companyCode),
      probe(accessToken, "Device (common)", "GET", `${commonBase}/common/device${query}`, companyCode),
      probe(accessToken, "Device (uts)", "GET", `${utsBase}/common/device${query}`, companyCode),
      probe(accessToken, "Devices (common)", "GET", `${commonBase}/common/devices${query}`, companyCode),
      probe(accessToken, "Tag (common)", "GET", `${commonBase}/common/tag${query}`, companyCode),
      probe(accessToken, "Tag (uts)", "GET", `${utsBase}/common/tag${query}`, companyCode),
      probe(accessToken, "Tags (common)", "GET", `${commonBase}/common/tags${query}`, companyCode),
      probe(accessToken, "Labels (common)", "GET", `${commonBase}/common/labels${query}`, companyCode),
      probe(accessToken, "Gateway (common)", "GET", `${commonBase}/common/gateway${query}`, companyCode),
      probe(accessToken, "Articles (common)", "GET", `${commonBase}/common/articles${query}`, companyCode),
    ]);

    const summary = Object.fromEntries(
      results.map((r) => [r.name, r.status === null ? "error" : r.status]),
    );

    return NextResponse.json({
      authenticated: true,
      storeId: storeId || null,
      companyCodeConfigured: Boolean(companyCode),
      summary,
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
