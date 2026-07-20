import { NextResponse } from "next/server";
import { isAimsConfigured } from "@/lib/config";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "esl",
    aimsConfigured: isAimsConfigured(),
    timestamp: new Date().toISOString(),
  });
}
