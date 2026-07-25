import { z } from "zod";

export const meetingDisplaySchema = z.object({
  roomId: z.string().min(1),
  meetingName: z.string().min(1),
  attendees: z.union([z.array(z.string().min(1)), z.string().min(1)]),
  organizerName: z.string().min(1),
  /** Preserve AIMS Product Name (e.g. 명패1). Defaults to roomId. */
  articleName: z.string().min(1).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export type MeetingDisplayInput = z.infer<typeof meetingDisplaySchema>;

/**
 * AIMS SaaS Article upsert body.
 * Template fields: MEETING_NAME, ATTENDEES, ORGANIZER_NAME
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
  const articleName = input.articleName?.trim() || input.roomId;

  const data: Record<string, string> = {
    ARTICLE_ID: input.roomId,
    ITEM_NAME: input.meetingName,
    MEETING_NAME: input.meetingName,
    ATTENDEES: attendees,
    ORGANIZER_NAME: input.organizerName,
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
      articleName,
      data,
    },
  ];
}
