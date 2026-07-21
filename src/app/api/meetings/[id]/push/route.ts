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

  try {
    const result = await syncMeetingDisplay({
      roomId: meeting.roomId,
      meetingName: meeting.meetingName,
      attendees: meeting.attendees,
      organizerName: meeting.organizerName,
    });

    const updated = await updateMeeting(id, {
      lastPushedAt: new Date().toISOString(),
      lastPushStatus: "success",
      lastPushError: undefined,
    });

    return NextResponse.json({ ok: true, result, meeting: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push failed";
    await updateMeeting(id, {
      lastPushedAt: new Date().toISOString(),
      lastPushStatus: "failed",
      lastPushError: message,
    });

    if (error instanceof AimsClientError) {
      return NextResponse.json(
        { error: message, details: error.body },
        { status: error.status },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
