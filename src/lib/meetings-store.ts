import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

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

type MeetingStore = {
  meetings: MeetingRecord[];
};

function dataFilePath(): string {
  const dir = process.env.DATA_DIR?.trim() || path.join(process.cwd(), "data");
  return path.join(dir, "meetings.json");
}

function normalizeMeeting(raw: Partial<MeetingRecord> & { roomId?: string }): MeetingRecord | null {
  if (!raw.id || !raw.meetingName || !raw.organizerName) return null;
  return {
    id: raw.id,
    meetingName: raw.meetingName,
    organizerName: raw.organizerName,
    attendees: Array.isArray(raw.attendees) ? raw.attendees : [],
    seats: Array.isArray(raw.seats) ? raw.seats : [],
    lastPushedAt: raw.lastPushedAt,
    lastPushStatus: raw.lastPushStatus,
    lastPushError: raw.lastPushError,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

async function ensureStore(): Promise<MeetingStore> {
  const file = dataFilePath();
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as MeetingStore;
    const meetings = (parsed.meetings ?? [])
      .map((m) => normalizeMeeting(m as MeetingRecord & { roomId?: string }))
      .filter((m): m is MeetingRecord => Boolean(m));
    return { meetings };
  } catch {
    const empty: MeetingStore = { meetings: [] };
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(empty, null, 2), "utf8");
    return empty;
  }
}

async function writeStore(store: MeetingStore): Promise<void> {
  const file = dataFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store, null, 2), "utf8");
}

export async function listMeetings(): Promise<MeetingRecord[]> {
  const store = await ensureStore();
  return [...store.meetings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getMeeting(id: string): Promise<MeetingRecord | null> {
  const store = await ensureStore();
  return store.meetings.find((m) => m.id === id) ?? null;
}

export async function createMeeting(input: {
  meetingName: string;
  attendees: string[];
  organizerName: string;
  seats?: SeatAssignment[];
}): Promise<MeetingRecord> {
  const store = await ensureStore();
  const now = new Date().toISOString();
  const meeting: MeetingRecord = {
    id: randomUUID(),
    meetingName: input.meetingName,
    attendees: input.attendees,
    organizerName: input.organizerName,
    seats: input.seats ?? [],
    createdAt: now,
    updatedAt: now,
  };
  store.meetings.push(meeting);
  await writeStore(store);
  return meeting;
}

export async function updateMeeting(
  id: string,
  input: Partial<{
    meetingName: string;
    attendees: string[];
    organizerName: string;
    seats: SeatAssignment[];
    lastPushedAt: string;
    lastPushStatus: "success" | "failed";
    lastPushError?: string;
  }>,
): Promise<MeetingRecord | null> {
  const store = await ensureStore();
  const index = store.meetings.findIndex((m) => m.id === id);
  if (index < 0) return null;

  const current = store.meetings[index];
  const updated: MeetingRecord = {
    ...current,
    ...input,
    lastPushError: input.lastPushError,
    updatedAt: new Date().toISOString(),
  };
  if ("lastPushError" in input && input.lastPushError === undefined) {
    delete updated.lastPushError;
  }
  store.meetings[index] = updated;
  await writeStore(store);
  return updated;
}

export async function deleteMeeting(id: string): Promise<boolean> {
  const store = await ensureStore();
  const next = store.meetings.filter((m) => m.id !== id);
  if (next.length === store.meetings.length) return false;
  store.meetings = next;
  await writeStore(store);
  return true;
}
