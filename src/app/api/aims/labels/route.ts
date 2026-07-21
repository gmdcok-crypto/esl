import { NextRequest, NextResponse } from "next/server";
import { AimsClientError, listSeatLabels } from "@/lib/aims/labels";
import { isAimsConfigured } from "@/lib/config";

export async function GET(_request: NextRequest) {
  if (!isAimsConfigured()) {
    return NextResponse.json({ error: "AIMS not configured" }, { status: 503 });
  }

  try {
    const { labels, raw } = await listSeatLabels();
    return NextResponse.json({ labels, count: labels.length, raw });
  } catch (error) {
    if (error instanceof AimsClientError) {
      return NextResponse.json({ error: error.message, details: error.body }, { status: error.status });
    }
    throw error;
  }
}
