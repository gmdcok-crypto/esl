import { NextResponse } from "next/server";
import { AimsAuthError, getAimsAccessToken } from "@/lib/aims/auth";
import { getAimsApiBaseUrl, getEnv, isAimsConfigured } from "@/lib/config";

async function callGet(accessToken: string, url: string) {
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
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 300);
  }
  return { url, status: response.status, ok: response.ok, body };
}

export async function GET() {
  if (!isAimsConfigured()) {
    return NextResponse.json({ error: "AIMS not configured" }, { status: 503 });
  }

  try {
    const accessToken = await getAimsAccessToken(true);
    const env = getEnv();
    const apiBase = getAimsApiBaseUrl();
    const company = env.AIMS_COMPANY_CODE ?? "";
    const store = env.AIMS_STORE_ID ?? "";
    const qs = new URLSearchParams({ company, store }).toString();

    const storeCall = await callGet(accessToken, `${apiBase}/common/store?${qs}`);
    const articlesCall = await callGet(accessToken, `${apiBase}/common/articles?${qs}`);
    const labelsCall = await callGet(accessToken, `${apiBase}/common/labels?${qs}`);
    const gatewayCall = await callGet(accessToken, `${apiBase}/common/gateway?${qs}`);

    const allOk = [storeCall, articlesCall, labelsCall, gatewayCall].every((r) => r.ok);

    return NextResponse.json({
      authenticated: true,
      docsNote: "AIMS SaaS requires query params company + store (not storeId/stationCode).",
      company,
      store,
      summary: {
        store: storeCall.status,
        articles: articlesCall.status,
        labels: labelsCall.status,
        gateway: gatewayCall.status,
      },
      tests: { storeCall, articlesCall, labelsCall, gatewayCall },
      verdict: allOk
        ? "company+store query params work. Proceed with meeting webhook."
        : "Still failing — check AIMS account permissions if 401, or store/company values if 405.",
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
