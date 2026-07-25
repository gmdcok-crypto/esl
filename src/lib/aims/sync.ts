import { getAimsClient } from "@/lib/aims/client";
import { meetingDisplaySchema, toAimsMeetingArticle } from "@/lib/aims/meeting";
import { isAimsConfigured } from "@/lib/config";

function assertAimsConfigured() {
  if (!isAimsConfigured()) {
    throw new Error("AIMS is not configured. Set AIMS_BASE_URL, AIMS_USERNAME, and AIMS_PASSWORD.");
  }
}

export async function syncMeetingDisplay(input: unknown) {
  assertAimsConfigured();
  const meeting = meetingDisplaySchema.parse(input);
  const payload = toAimsMeetingArticle(meeting);
  const aims = getAimsClient();
  return aims.upsertMeetingArticle(payload);
}

/** Blank meeting fields on an ESL so the nameplate no longer shows an assignment. */
export async function clearMeetingDisplay(input: {
  roomId: string;
  articleName?: string;
}) {
  assertAimsConfigured();
  const roomId = input.roomId.trim();
  if (!roomId) {
    throw new Error("roomId is required to clear a meeting display");
  }
  const articleName = input.articleName?.trim() || roomId;
  const aims = getAimsClient();
  return aims.upsertMeetingArticle([
    {
      articleId: roomId,
      articleName,
      data: {
        ARTICLE_ID: roomId,
        ITEM_NAME: "",
        MEETING_NAME: "",
        ATTENDEES: "",
        ORGANIZER_NAME: "",
      },
    },
  ]);
}

export async function syncMeetingDisplays(items: unknown[]) {
  const results = [];
  for (const item of items) {
    results.push(await syncMeetingDisplay(item));
  }
  return results;
}
