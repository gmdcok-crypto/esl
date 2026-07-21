import { randomUUID } from "crypto";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { withDatabase } from "@/lib/db";

export type SeatAssignment = {
  labelCode: string;
  articleId: string;
  attendeeName: string;
};

export type MeetingRecord = {
  id: string;
  meetingName: string;
  attendees: string[];
  organizerName: string;
  seats: SeatAssignment[];
  lastPushedAt?: string;
  lastPushStatus?: "success" | "failed";
  lastPushError?: string;
  createdAt: string;
  updatedAt: string;
};

type MeetingRow = RowDataPacket & {
  id: string;
  meeting_name: string;
  organizer_name: string;
  attendees: string | string[];
  seats: string | SeatAssignment[];
  last_pushed_at: Date | string | null;
  last_push_status: "success" | "failed" | null;
  last_push_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function parseJson<T>(value: string | T): T {
  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }
  return value;
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function rowToMeeting(row: MeetingRow): MeetingRecord {
  const meeting: MeetingRecord = {
    id: row.id,
    meetingName: row.meeting_name,
    organizerName: row.organizer_name,
    attendees: parseJson<string[]>(row.attendees),
    seats: parseJson<SeatAssignment[]>(row.seats),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
  };

  const lastPushedAt = toIso(row.last_pushed_at);
  if (lastPushedAt) meeting.lastPushedAt = lastPushedAt;
  if (row.last_push_status) meeting.lastPushStatus = row.last_push_status;
  if (row.last_push_error) meeting.lastPushError = row.last_push_error;

  return meeting;
}

export async function listMeetings(): Promise<MeetingRecord[]> {
  return withDatabase(async (db) => {
    const [rows] = await db.query<MeetingRow[]>(
      `SELECT id, meeting_name, organizer_name, attendees, seats,
              last_pushed_at, last_push_status, last_push_error,
              created_at, updated_at
       FROM meetings
       ORDER BY updated_at DESC`,
    );
    return rows.map(rowToMeeting);
  });
}

export async function getMeeting(id: string): Promise<MeetingRecord | null> {
  return withDatabase(async (db) => {
    const [rows] = await db.query<MeetingRow[]>(
      `SELECT id, meeting_name, organizer_name, attendees, seats,
              last_pushed_at, last_push_status, last_push_error,
              created_at, updated_at
       FROM meetings
       WHERE id = ?
       LIMIT 1`,
      [id],
    );
    const row = rows[0];
    return row ? rowToMeeting(row) : null;
  });
}

export async function createMeeting(input: {
  meetingName: string;
  attendees: string[];
  organizerName: string;
  seats?: SeatAssignment[];
}): Promise<MeetingRecord> {
  return withDatabase(async (db) => {
    const id = randomUUID();
    const now = new Date();
    await db.execute(
      `INSERT INTO meetings (
         id, meeting_name, organizer_name, attendees, seats,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.meetingName,
        input.organizerName,
        JSON.stringify(input.attendees),
        JSON.stringify(input.seats ?? []),
        now,
        now,
      ],
    );
    const meeting = await fetchMeetingRow(db, id);
    if (!meeting) {
      throw new Error("Failed to create meeting");
    }
    return meeting;
  });
}

type MeetingUpdateInput = Partial<{
  meetingName: string;
  attendees: string[];
  organizerName: string;
  seats: SeatAssignment[];
  lastPushedAt: string;
  lastPushStatus: "success" | "failed";
  lastPushError?: string;
}>;

function applyMeetingUpdate(current: MeetingRecord, input: MeetingUpdateInput): MeetingRecord {
  const updated: MeetingRecord = {
    ...current,
    updatedAt: new Date().toISOString(),
  };

  if (input.meetingName !== undefined) updated.meetingName = input.meetingName;
  if (input.organizerName !== undefined) updated.organizerName = input.organizerName;
  if (input.attendees !== undefined) updated.attendees = input.attendees;
  if (input.seats !== undefined) updated.seats = input.seats;
  if (input.lastPushedAt !== undefined) updated.lastPushedAt = input.lastPushedAt;
  if (input.lastPushStatus !== undefined) updated.lastPushStatus = input.lastPushStatus;
  if ("lastPushError" in input) {
    if (input.lastPushError === undefined) delete updated.lastPushError;
    else updated.lastPushError = input.lastPushError;
  }

  return updated;
}

async function fetchMeetingRow(db: Pool, id: string): Promise<MeetingRecord | null> {
  const [rows] = await db.query<MeetingRow[]>(
    `SELECT id, meeting_name, organizer_name, attendees, seats,
            last_pushed_at, last_push_status, last_push_error,
            created_at, updated_at
     FROM meetings
     WHERE id = ?
     LIMIT 1`,
    [id],
  );
  const row = rows[0];
  return row ? rowToMeeting(row) : null;
}

export async function updateMeeting(
  id: string,
  input: MeetingUpdateInput,
): Promise<MeetingRecord | null> {
  return withDatabase(async (db) => {
    const current = await fetchMeetingRow(db, id);
    if (!current) return null;

    const updated = applyMeetingUpdate(current, input);

    await db.execute(
      `UPDATE meetings SET
         meeting_name = ?,
         organizer_name = ?,
         attendees = ?,
         seats = ?,
         last_pushed_at = ?,
         last_push_status = ?,
         last_push_error = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        updated.meetingName,
        updated.organizerName,
        JSON.stringify(updated.attendees),
        JSON.stringify(updated.seats),
        updated.lastPushedAt ? new Date(updated.lastPushedAt) : null,
        updated.lastPushStatus ?? null,
        updated.lastPushError ?? null,
        new Date(updated.updatedAt),
        id,
      ],
    );

    return fetchMeetingRow(db, id);
  });
}

export async function deleteMeeting(id: string): Promise<boolean> {
  return withDatabase(async (db) => {
    const [result] = await db.execute<ResultSetHeader>(
      "DELETE FROM meetings WHERE id = ?",
      [id],
    );
    return result.affectedRows > 0;
  });
}
