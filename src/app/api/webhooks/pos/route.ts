import { NextRequest, NextResponse } from "next/server";
import { syncProductsFromPos } from "@/lib/aims/sync";
import { isAimsConfigured } from "@/lib/config";

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

  const body = await request.json();
  const items = Array.isArray(body) ? body : body.items;

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Expected array of products" }, { status: 400 });
  }

  const results = await syncProductsFromPos(items);
  return NextResponse.json({ synced: results.length, results });
}
