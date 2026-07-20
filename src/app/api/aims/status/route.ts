import { NextResponse } from "next/server";
import { AimsAuthError, getAimsAccessToken } from "@/lib/aims/auth";
import { getAimsClient, AimsClientError } from "@/lib/aims/client";
import { getEnv, isAimsConfigured } from "@/lib/config";

export async function GET() {
  if (!isAimsConfigured()) {
    return NextResponse.json(
      { configured: false, message: "AIMS credentials are not set" },
      { status: 503 },
    );
  }

  try {
    await getAimsAccessToken();
    const env = getEnv();

    if (env.AIMS_STORE_ID) {
      try {
        const aims = getAimsClient();
        await aims.listProducts(1, 1);
        return NextResponse.json({
          configured: true,
          authenticated: true,
          storeId: env.AIMS_STORE_ID,
          articlesApi: "ok",
          message: "AIMS token issued and Articles API is reachable.",
        });
      } catch (error) {
        if (error instanceof AimsClientError) {
          const hint =
            error.status === 401
              ? "Token login succeeded, but Articles API returned 401. Set AIMS_COMPANY_CODE in Railway (JWT CustomerCode, e.g. BLU), redeploy, then test GET /common/articles in ESL API Explorer with the same account. If Swagger also returns 401, ask SoluM to enable Articles API access."
              : undefined;
          return NextResponse.json({
            configured: true,
            authenticated: true,
            storeId: env.AIMS_STORE_ID,
            companyCodeConfigured: Boolean(env.AIMS_COMPANY_CODE),
            articlesApi: "failed",
            message: "AIMS token issued, but Articles API call failed.",
            error: error.message,
            details: error.body,
            ...(hint ? { hint } : {}),
          });
        }
        throw error;
      }
    }

    try {
      const aims = getAimsClient();
      const stores = await aims.listStores();
      return NextResponse.json({ configured: true, authenticated: true, stores, count: stores.length });
    } catch (error) {
      if (error instanceof AimsClientError) {
        return NextResponse.json({
          configured: true,
          authenticated: true,
          message: "Token issued successfully, but store lookup failed",
          error: error.message,
          details: error.body,
        });
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof AimsAuthError) {
      return NextResponse.json(
        { configured: true, authenticated: false, error: error.message, details: error.body },
        { status: error.status },
      );
    }
    if (error instanceof Error) {
      return NextResponse.json(
        { configured: true, authenticated: false, error: error.message },
        { status: 500 },
      );
    }
    throw error;
  }
}
