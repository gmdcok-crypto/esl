import { NextResponse } from "next/server";
import { isAimsConfigured } from "@/lib/config";
import { isDatabaseConfigured, pingDatabase } from "@/lib/db";

export async function GET() {
  const databaseConfigured = isDatabaseConfigured();
  let databaseOk = false;
  if (databaseConfigured) {
    try {
      databaseOk = await pingDatabase();
    } catch {
      databaseOk = false;
    }
  }

  return NextResponse.json({
    status: "ok",
    service: "esl",
    aimsConfigured: isAimsConfigured(),
    databaseConfigured,
    databaseOk,
    timestamp: new Date().toISOString(),
  });
}
