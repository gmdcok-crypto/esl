import { NextRequest, NextResponse } from "next/server";
import { getBearerToken, verifyAppToken } from "@/lib/app-auth";

export async function requireAppUser(request: NextRequest) {
  const token = getBearerToken(request.headers.get("authorization"));
  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  try {
    const user = await verifyAppToken(token);
    return { user };
  } catch {
    return { error: NextResponse.json({ error: "Invalid or expired token" }, { status: 401 }) };
  }
}
