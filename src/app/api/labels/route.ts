import { NextRequest, NextResponse } from "next/server";
import { listSeatLabels, AimsClientError } from "@/lib/aims/labels";
import { isAimsConfigured } from "@/lib/config";
import { requireAppUser } from "@/lib/require-app-user";

export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request);
  if (auth.error) return auth.error;

  if (!isAimsConfigured()) {
    return NextResponse.json({ error: "AIMS not configured" }, { status: 503 });
  }

  try {
    const labels = await listSeatLabels();
    return NextResponse.json({ labels });
  } catch (error) {
    if (error instanceof AimsClientError) {
      return NextResponse.json({ error: error.message, details: error.body }, { status: error.status });
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }
}
