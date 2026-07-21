import { NextRequest, NextResponse } from "next/server";
import { AimsClientError, listSeatLabels } from "@/lib/aims/labels";
import { isAimsConfigured } from "@/lib/config";
import { requireAppUser } from "@/lib/require-app-user";

export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request);
  if (auth.error) return auth.error;

  if (!isAimsConfigured()) {
    return NextResponse.json({ error: "AIMS not configured", labels: [] }, { status: 503 });
  }

  try {
    const { labels, raw } = await listSeatLabels();
    return NextResponse.json({
      labels,
      count: labels.length,
      debug: {
        rawType: typeof raw,
        rawIsArray: Array.isArray(raw),
        rawKeys: raw && typeof raw === "object" ? Object.keys(raw as object) : [],
      },
    });
  } catch (error) {
    if (error instanceof AimsClientError) {
      return NextResponse.json(
        { error: error.message, details: error.body, labels: [] },
        { status: error.status },
      );
    }
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message, labels: [] }, { status: 500 });
    }
    throw error;
  }
}
