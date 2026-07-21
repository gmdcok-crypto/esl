import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteMeeting, getMeeting, updateMeeting } from "@/lib/meetings-store";
import { requireAppUser } from "@/lib/require-app-user";

const seatSchema = z.object({
  labelCode: z.string().min(1),
  articleId: z.string().min(1),
  attendeeName: z.string().min(1),
});

const meetingSchema = z.object({
  meetingName: z.string().min(1).optional(),
  organizerName: z.string().min(1).optional(),
  attendees: z.union([z.array(z.string().min(1)), z.string().min(1)]).optional(),
  seats: z.array(seatSchema).optional(),
});

function normalizeAttendees(attendees: string[] | string): string[] {
  if (Array.isArray(attendees)) {
    return attendees.map((a) => a.trim()).filter(Boolean);
  }
  return attendees
    .split(/[,/\n]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAppUser(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const meeting = await getMeeting(id);
  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  return NextResponse.json({ meeting });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireAppUser(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await request.json();
  const parsed = meetingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid meeting payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const meeting = await updateMeeting(id, {
    meetingName: parsed.data.meetingName,
    organizerName: parsed.data.organizerName,
    seats: parsed.data.seats,
    ...(parsed.data.attendees !== undefined
      ? { attendees: normalizeAttendees(parsed.data.attendees) }
      : {}),
  });

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  return NextResponse.json({ meeting });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const auth = await requireAppUser(request);
  if (auth.error) return auth.error;

  const { id } = await params;
  const ok = await deleteMeeting(id);
  if (!ok) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }
  return NextResponse.json({ deleted: true });
}
