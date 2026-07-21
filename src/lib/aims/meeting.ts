import { z } from "zod";

export const meetingDisplaySchema = z.object({
  roomId: z.string().min(1),
  meetingName: z.string().min(1),
  attendees: z.union([z.array(z.string().min(1)), z.string().min(1)]),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export type MeetingDisplayInput = z.infer<typeof meetingDisplaySchema>;

/**
 * AIMS SaaS Article upsert body.
 * Fields inside `data` must match the store Product File Config / template fields.
 */
export type AimsMeetingArticlePayload = Array<{
  articleId: string;
  articleName: string;
  data: Record<string, string>;
}>;

function formatAttendees(attendees: string[] | string): string {
  if (Array.isArray(attendees)) {
    return attendees.join(", ");
  }
  return attendees;
}

export function toAimsMeetingArticle(input: MeetingDisplayInput): AimsMeetingArticlePayload {
  const attendees = formatAttendees(input.attendees);

  const data: Record<string, string> = {
    ARTICLE_ID: input.roomId,
    ITEM_NAME: input.meetingName,
    MEETING_NAME: input.meetingName,
    ATTENDEES: attendees,
  };

  if (input.startTime) {
    data.START_TIME = input.startTime;
  }
  if (input.endTime) {
    data.END_TIME = input.endTime;
  }

  return [
    {
      articleId: input.roomId,
      articleName: input.meetingName,
      data,
    },
  ];
}
