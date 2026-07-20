import { NextResponse } from "next/server";

/** @deprecated 회의실 ESL 위주 — POST /api/webhooks/meeting 사용 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Deprecated",
      message: "POS webhook is no longer supported. Use POST /api/webhooks/meeting for meeting room displays.",
    },
    { status: 410 },
  );
}
