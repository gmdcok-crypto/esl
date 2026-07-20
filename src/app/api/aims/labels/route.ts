import { NextRequest, NextResponse } from "next/server";
import { getAimsClient } from "@/lib/aims/client";
import { AimsClientError } from "@/lib/aims/client";
import { isAimsConfigured } from "@/lib/config";

export async function GET(request: NextRequest) {
  if (!isAimsConfigured()) {
    return NextResponse.json({ error: "AIMS not configured" }, { status: 503 });
  }

  const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
  const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? "50");

  try {
    const aims = getAimsClient();
    const labels = await aims.listLabels(page, pageSize);
    return NextResponse.json(labels);
  } catch (error) {
    if (error instanceof AimsClientError) {
      return NextResponse.json({ error: error.message, details: error.body }, { status: error.status });
    }
    throw error;
  }
}
