import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AimsClientError } from "@/lib/aims/client";
import { syncMeetingDisplay, syncMeetingDisplays } from "@/lib/aims/sync";
import { isAimsConfigured } from "@/lib/config";

function errorResponse(error: unknown) {
  if (error instanceof AimsClientError) {
    return NextResponse.json({ error: error.message, details: error.body }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request body", details: error.flatten() }, { status: 400 });
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown error" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  if (!isAimsConfigured()) {
    return NextResponse.json({ error: "AIMS not configured" }, { status: 503 });
  }

  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const provided = request.headers.get("x-webhook-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await request.json();
    const items = Array.isArray(body) ? body : body.items ?? body.meetings ?? body;

    if (Array.isArray(items)) {
      const results = await syncMeetingDisplays(items);
      return NextResponse.json({ synced: results.length, results });
    }

    const result = await syncMeetingDisplay(body);
    return NextResponse.json({ synced: 1, result });
  } catch (error) {
    return errorResponse(error);
  }
}
