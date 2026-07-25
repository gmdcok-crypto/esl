import { getAimsClient, AimsClientError } from "@/lib/aims/client";
import { listSeatLabels, type SeatLabel } from "@/lib/aims/labels";

const NAMEPLATE_ID_RE = /^명패(\d+)$/;

export type NameplateEnsureResult = {
  labelCode: string;
  articleId: string;
  articleName: string;
  status: "created" | "skipped" | "failed";
  error?: string;
};

export type EnsureNameplatesResponse = {
  created: number;
  skipped: number;
  failed: number;
  results: NameplateEnsureResult[];
  labels: SeatLabel[];
};

function parseNameplateNumber(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(NAMEPLATE_ID_RE);
  if (!match) return null;
  return Number(match[1]);
}

function collectUsedNumbers(labels: SeatLabel[]): Set<number> {
  const used = new Set<number>();
  for (const label of labels) {
    const fromId = parseNameplateNumber(label.articleId);
    const fromName = parseNameplateNumber(label.articleName);
    if (fromId != null) used.add(fromId);
    if (fromName != null) used.add(fromName);
  }
  return used;
}

function nextNameplateNumber(used: Set<number>): number {
  let n = 1;
  while (used.has(n)) n += 1;
  used.add(n);
  return n;
}

function toNameplateId(n: number): string {
  return `명패${n}`;
}

/**
 * For each AIMS label without an Article, create 명패N and link it.
 * Labels that already have an Article are skipped.
 */
export async function ensureNameplateArticles(): Promise<EnsureNameplatesResponse> {
  const aims = getAimsClient();
  const { labels: before } = await listSeatLabels();
  const used = collectUsedNumbers(before);
  const targets = [...before]
    .filter((label) => !label.articleId)
    .sort((a, b) => a.labelCode.localeCompare(b.labelCode));

  const results: NameplateEnsureResult[] = [];

  for (const label of before) {
    if (label.articleId) {
      results.push({
        labelCode: label.labelCode,
        articleId: label.articleId,
        articleName: label.articleName ?? label.articleId,
        status: "skipped",
      });
    }
  }

  for (const label of targets) {
    const n = nextNameplateNumber(used);
    const articleId = toNameplateId(n);
    const articleName = articleId;

    try {
      await aims.upsertMeetingArticle([
        {
          articleId,
          articleName,
          data: {
            ARTICLE_ID: articleId,
            ITEM_NAME: articleName,
            MEETING_NAME: "",
            ATTENDEES: "",
            ORGANIZER_NAME: "",
          },
        },
      ]);

      const linkBody: {
        labelCode: string;
        articleId: string;
        articleName: string;
        templateName?: string;
      } = {
        labelCode: label.labelCode,
        articleId,
        articleName,
      };
      if (label.templateName) {
        linkBody.templateName = label.templateName;
      }

      await aims.assignLabel(linkBody);

      results.push({
        labelCode: label.labelCode,
        articleId,
        articleName,
        status: "created",
      });
    } catch (error) {
      const message =
        error instanceof AimsClientError
          ? error.message
          : error instanceof Error
            ? error.message
            : "명패 생성 실패";
      results.push({
        labelCode: label.labelCode,
        articleId,
        articleName,
        status: "failed",
        error: message,
      });
    }
  }

  const { labels } = await listSeatLabels();
  return {
    created: results.filter((r) => r.status === "created").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
    labels,
  };
}

export { AimsClientError };
