import { NextResponse } from "next/server";
import { isAppAuthConfigured } from "@/lib/app-auth";
import { isAimsConfigured } from "@/lib/config";
import { isDatabaseConfigured, pingDatabase } from "@/lib/db";

export async function GET() {
  const databaseConfigured = isDatabaseConfigured();
  const databaseOk = databaseConfigured ? await pingDatabase() : false;

  return NextResponse.json({
    status: "ok",
    service: "esl",
    aimsConfigured: isAimsConfigured(),
    appAuthConfigured: isAppAuthConfigured(),
    databaseConfigured,
    databaseOk,
    timestamp: new Date().toISOString(),
  });
}
