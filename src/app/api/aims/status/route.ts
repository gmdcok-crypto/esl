import { NextResponse } from "next/server";
import { AimsAuthError, getAimsAccessToken } from "@/lib/aims/auth";
import { getAimsClient, AimsClientError } from "@/lib/aims/client";
import { isAimsConfigured } from "@/lib/config";

export async function GET() {
  if (!isAimsConfigured()) {
    return NextResponse.json(
      { configured: false, message: "AIMS credentials are not set" },
      { status: 503 },
    );
  }

  try {
    await getAimsAccessToken();

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