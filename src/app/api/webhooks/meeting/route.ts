import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AimsClientError } from "@/lib/aims/client";
import { syncMeetingDisplay, syncMeetingDisplays } from "@/lib/aims/sync";
import { isAimsConfigured } from "@/lib/config";

function errorResponse(error: unknown) {
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      {
        error: "Invalid JSON body",
        message: "Send Content-Type: application/json with valid JSON. On Windows PowerShell, use Invoke-RestMethod instead of curl with escaped quotes.",
      },
      { status: 400 },
    );
  }
  if (error instanceof AimsClientError) {
    const body: Record<string, unknown> = { error: error.message, details: error.body };
    if (error.status === 401) {
      body.hint =
        "AIMS Articles API rejected the token. Add AIMS_COMPANY_CODE in Railway (JWT CustomerCode, e.g. BLU) and redeploy. If ESL API Explorer also returns 401 for GET /common/articles, contact SoluM to enable Articles API access.";
    }
    return NextResponse.json(body, { status: error.status });
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
