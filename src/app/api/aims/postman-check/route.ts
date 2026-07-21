import { NextResponse } from "next/server";
import { AimsAuthError, getAimsAccessToken } from "@/lib/aims/auth";
import { getAimsApiBaseUrl, getEnv, isAimsConfigured } from "@/lib/config";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function callStore(accessToken: string, url: string, headers: Record<string, string>) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...headers,
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
  return { status: response.status, ok: response.ok, body };
}

export async function GET() {
  if (!isAimsConfigured()) {
    return NextResponse.json({ error: "AIMS not configured" }, { status: 503 });
  }

  try {
    const accessToken = await getAimsAccessToken(true);
    const env = getEnv();
    const apiBase = getAimsApiBaseUrl();
    const storeUrl = `${apiBase}/common/store`;
    const storeUrlWithQuery = `${storeUrl}?storeId=${encodeURIComponent(env.AIMS_STORE_ID ?? "")}`;
    const payload = decodeJwtPayload(accessToken);

    const postmanStyle = await callStore(accessToken, storeUrl, {});
    const withStoreId = await callStore(accessToken, storeUrlWithQuery, {});
    const withCompanyHeader = await callStore(accessToken, storeUrl, {
      ...(env.AIMS_COMPANY_CODE ? { "Company-Code": env.AIMS_COMPANY_CODE } : {}),
    });

    const verdict =
      postmanStyle.status === 401 && withStoreId.status === 401 && withCompanyHeader.status === 401
        ? "Postman-equivalent call also returns 401. This is an AIMS account/permission issue, not Railway header/token storage."
        : postmanStyle.ok || withStoreId.ok || withCompanyHeader.ok
          ? "At least one Store call succeeded. Compare working headers with Railway client."
          : `Store calls failed with statuses: bare=${postmanStyle.status}, storeId=${withStoreId.status}, companyHeader=${withCompanyHeader.status}`;

    return NextResponse.json({
      authenticated: true,
      tokenHost: apiBase,
      storeUrl,
      tokenPreview: `${accessToken.slice(0, 12)}...${accessToken.slice(-8)}`,
      tokenClaims: payload
        ? {
            CustomerCode: payload.CustomerCode ?? payload.customerCode ?? null,
            companyCode: payload.companyCode ?? null,
            aud: payload.aud ?? null,
            iss: payload.iss ?? null,
            exp: payload.exp ?? null,
            roles: payload.roles ?? payload.role ?? null,
          }
        : null,
      tests: {
        postmanStyle_BearerOnly: postmanStyle,
        withStoreIdQuery: withStoreId,
        withCompanyCodeHeader: withCompanyHeader,
      },
      verdict,
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
