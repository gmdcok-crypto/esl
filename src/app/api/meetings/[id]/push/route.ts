import { NextRequest, NextResponse } from "next/server";
import { AimsClientError } from "@/lib/aims/client";
import { syncMeetingDisplay } from "@/lib/aims/sync";
import { isAimsConfigured } from "@/lib/config";
import { getMeeting, updateMeeting } from "@/lib/meetings-store";
import { requireAppUser } from "@/lib/require-app-user";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireAppUser(request);
  if (auth.error) return auth.error;

  if (!isAimsConfigured()) {
    return NextResponse.json({ error: "AIMS not configured" }, { status: 503 });
  }

  const { id } = await params;
  const meeting = await getMeeting(id);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const seats = meeting.seats.filter((s) => s.articleId && s.attendeeName);
  if (seats.length === 0) {
    return NextResponse.json(
      { error: "좌석 명패에 참석자를 선택한 뒤 전송하세요." },
      { status: 400 },
    );
  }

  try {
    const results = [];
    for (const seat of seats) {
      const result = await syncMeetingDisplay({
        roomId: seat.articleId,
        meetingName: meeting.meetingName,
        attendees: [seat.attendeeName],
        organizerName: meeting.organizerName,
      });
      results.push({ labelCode: seat.labelCode, articleId: seat.articleId, result });
    }

    const updated = await updateMeeting(id, {
      lastPushedAt: new Date().toISOString(),
      lastPushStatus: "success",
      lastPushError: undefined,
    });

    return NextResponse.json({ ok: true, pushed: results.length, results, meeting: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push failed";
    await updateMeeting(id, {
      lastPushedAt: new Date().toISOString(),
      lastPushStatus: "failed",
      lastPushError: message,
    });

    if (error instanceof AimsClientError) {
      return NextResponse.json({ error: message, details: error.body }, { status: error.status });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
