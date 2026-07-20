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

export async function syncMeetingDisplays(items: unknown[]) {
  const results = [];
  for (const item of items) {
    results.push(await syncMeetingDisplay(item));
  }
  return results;
}
