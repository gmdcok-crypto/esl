import { NextResponse } from "next/server";
import { AimsAuthError } from "@/lib/aims/auth";
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
    const aims = getAimsClient();
    const store = await aims.getStore();
    return NextResponse.json({ configured: true, authenticated: true, store });
  } catch (error) {
    if (error instanceof AimsAuthError) {
      return NextResponse.json(
        { configured: true, authenticated: false, error: error.message, details: error.body },
        { status: error.status },
      );
    }
    if (error instanceof AimsClientError) {
      return NextResponse.json(
        { configured: true, authenticated: true, error: error.message, details: error.body },
        { status: error.status },
      );
    }
    throw error;
  }
}