import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createMeeting, listMeetings } from "@/lib/meetings-store";
import { requireAppUser } from "@/lib/require-app-user";

const seatSchema = z.object({
  labelCode: z.string().min(1),
  articleId: z.string().min(1),
  attendeeName: z.string().min(1),
});

const meetingSchema = z.object({
  meetingName: z.string().min(1),
  organizerName: z.string().min(1),
  attendees: z.union([z.array(z.string().min(1)), z.string().min(1)]),
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

export async function GET(request: NextRequest) {
  const auth = await requireAppUser(request);
  if (auth.error) return auth.error;
  try {
    const meetings = await listMeetings();
    return NextResponse.json({ meetings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAppUser(request);
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = meetingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid meeting payload", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const meeting = await createMeeting({
      meetingName: parsed.data.meetingName,
      organizerName: parsed.data.organizerName,
      attendees: normalizeAttendees(parsed.data.attendees),
      seats: parsed.data.seats ?? [],
    });

    return NextResponse.json({ meeting }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database unavailable";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
