import { getAimsClient, AimsClientError } from "@/lib/aims/client";

export type SeatLabel = {
  labelCode: string;
  articleId: string;
  articleName?: string;
  online: boolean;
  battery?: string;
  gatewayName?: string;
  type?: string;
  templateName?: string;
};

type AimsLabelRaw = {
  labelCode?: string;
  label?: string;
  networkStatus?: boolean;
  battery?: string;
  type?: string;
  templateName?: string[] | string;
  gateway?: { name?: string };
  articleList?: Array<{ articleId?: string; articleName?: string; name?: string }>;
};

type AimsArticleRaw = {
  articleId?: string;
  articleName?: string;
  name?: string;
  id?: string;
  sku?: string;
  data?: Record<string, string>;
};

export function extractLabelList(raw: unknown): AimsLabelRaw[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as AimsLabelRaw[];
  if (typeof raw !== "object") return [];

  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.labelList)) return obj.labelList as AimsLabelRaw[];
  if (Array.isArray(obj.items)) return obj.items as AimsLabelRaw[];
  if (Array.isArray(obj.labels)) return obj.labels as AimsLabelRaw[];
  return [];
}

function extractArticleList(raw: unknown): AimsArticleRaw[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as AimsArticleRaw[];
  if (typeof raw !== "object") return [];

  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.articleList)) return obj.articleList as AimsArticleRaw[];
  if (Array.isArray(obj.items)) return obj.items as AimsArticleRaw[];
  if (Array.isArray(obj.articles)) return obj.articles as AimsArticleRaw[];
  return [];
}

function resolveArticleName(article: AimsArticleRaw): string {
  const fromTop =
    article.articleName?.trim() ||
    article.name?.trim() ||
    "";
  if (fromTop) return fromTop;

  const data = article.data;
  if (data && typeof data === "object") {
    return (
      data.ITEM_NAME?.trim() ||
      data.ARTICLE_NAME?.trim() ||
      data.PRODUCT_NAME?.trim() ||
      ""
    );
  }
  return "";
}

/** articleId → AIMS Product Name (articleName) */
export async function fetchArticleNameMap(): Promise<Map<string, string>> {
  const aims = getAimsClient();
  const map = new Map<string, string>();

  // Pull a wide page so linked seat articles are included.
  const raw = await aims.listProducts(1, 200);
  for (const article of extractArticleList(raw)) {
    const id = (article.articleId || article.id || article.sku || "").trim();
    if (!id) continue;
    const name = resolveArticleName(article);
    if (name) map.set(id, name);
  }
  return map;
}

export function mapSeatLabels(
  raw: unknown,
  articleNames?: Map<string, string>,
): SeatLabel[] {
  return extractLabelList(raw)
    .map((label) => {
      const article = label.articleList?.[0];
      const template = Array.isArray(label.templateName)
        ? label.templateName[0]
        : label.templateName;
      const labelCode = label.labelCode ?? label.label ?? "";
      const articleId = (article?.articleId ?? "").trim();
      const linkedName =
        article?.articleName?.trim() ||
        article?.name?.trim() ||
        "";
      const catalogName = articleId ? articleNames?.get(articleId) : undefined;
      const articleName = catalogName || linkedName || undefined;

      return {
        labelCode,
        articleId,
        articleName,
        online: Boolean(label.networkStatus),
        battery: label.battery,
        gatewayName: label.gateway?.name,
        type: label.type,
        templateName: template,
      };
    })
    .filter((label) => Boolean(label.labelCode));
}

export async function listSeatLabels(): Promise<{ labels: SeatLabel[]; raw: unknown }> {
  const aims = getAimsClient();
  const raw = await aims.listLabels();

  let articleNames: Map<string, string> | undefined;
  try {
    articleNames = await fetchArticleNameMap();
  } catch {
    // Labels still work if Articles lookup fails.
    articleNames = undefined;
  }

  return { labels: mapSeatLabels(raw, articleNames), raw };
}

export { AimsClientError };
