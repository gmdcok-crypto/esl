import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  isAppAuthConfigured,
  signAppToken,
  verifyAppCredentials,
} from "@/lib/app-auth";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (!isAppAuthConfigured()) {
    return NextResponse.json(
      {
        error: "App auth not configured",
        message: "Set APP_JWT_SECRET, APP_USERNAME, and APP_PASSWORD in environment.",
      },
      { status: 503 },
    );
  }

  const body = await request.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid credentials payload" }, { status: 400 });
  }

  if (!verifyAppCredentials(parsed.data.username, parsed.data.password)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  try {
    const token = await signAppToken(parsed.data.username);
    return NextResponse.json({
      token,
      tokenType: "Bearer",
      expiresIn: "long-lived",
      user: { username: parsed.data.username },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to issue token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
