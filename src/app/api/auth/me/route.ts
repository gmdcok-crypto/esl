import { NextRequest, NextResponse } from "next/server";
import { requireAppUser } from "@/lib/require-app-user";

export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request);
  if (auth.error) return auth.error;
  return NextResponse.json({ user: auth.user });
}
