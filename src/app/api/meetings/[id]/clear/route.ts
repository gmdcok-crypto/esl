import { NextRequest, NextResponse } from "next/server";
import { AimsClientError } from "@/lib/aims/client";
import { listSeatLabels } from "@/lib/aims/labels";
import { clearMeetingDisplay } from "@/lib/aims/sync";
import { isAimsConfigured } from "@/lib/config";
import { getMeeting, updateMeeting, type SeatAssignment } from "@/lib/meetings-store";
import { requireAppUser } from "@/lib/require-app-user";

type Params = { params: Promise<{ id: string }> };

function parseSeats(value: unknown): SeatAssignment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const labelCode = typeof row.labelCode === "string" ? row.labelCode.trim() : "";
      const articleId = typeof row.articleId === "string" ? row.articleId.trim() : "";
      const attendeeName = typeof row.attendeeName === "string" ? row.attendeeName.trim() : "";
      if (!labelCode || !articleId) return null;
      return { labelCode, articleId, attendeeName };
    })
    .filter((seat): seat is SeatAssignment => seat !== null);
}

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

  const body = (await request.json().catch(() => ({}))) as {
    labelCode?: unknown;
    seats?: unknown;
  };
  const labelCode =
    typeof body.labelCode === "string" ? body.labelCode.trim() : "";

  const bodySeats = parseSeats(body.seats);
  const assignedSeats =
    bodySeats.length > 0
      ? bodySeats
      : meeting.seats.filter((s) => s.articleId && s.attendeeName);

  const seatsToClear = labelCode
    ? assignedSeats.filter((s) => s.labelCode === labelCode)
    : assignedSeats;

  if (seatsToClear.length === 0) {
    return NextResponse.json(
      {
        error: labelCode
          ? "해당 명패에 취소할 할당이 없습니다."
          : "취소할 할당이 없습니다.",
      },
      { status: 400 },
    );
  }

  try {
    const { labels } = await listSeatLabels();
    const articleNameById = new Map(
      labels
        .filter((l) => l.articleId)
        .map((l) => [l.articleId, l.articleName?.trim() || l.articleId] as const),
    );

    const results = [];
    for (const seat of seatsToClear) {
      const result = await clearMeetingDisplay({
        roomId: seat.articleId,
        articleName: articleNameById.get(seat.articleId) || seat.articleId,
      });
      results.push({ labelCode: seat.labelCode, articleId: seat.articleId, result });
    }

    const clearedCodes = new Set(seatsToClear.map((s) => s.labelCode));
    const remainingSeats = labelCode
      ? meeting.seats.filter((s) => !clearedCodes.has(s.labelCode))
      : [];

    const updated = await updateMeeting(id, {
      seats: remainingSeats,
      lastPushedAt: new Date().toISOString(),
      lastPushStatus: "success",
      lastPushError: undefined,
    });

    return NextResponse.json({
      ok: true,
      cleared: results.length,
      results,
      meeting: updated,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Clear failed";
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
