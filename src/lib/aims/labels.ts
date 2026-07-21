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
  articleList?: Array<{ articleId?: string; articleName?: string }>;
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

export function mapSeatLabels(raw: unknown): SeatLabel[] {
  return extractLabelList(raw)
    .map((label) => {
      const article = label.articleList?.[0];
      const template = Array.isArray(label.templateName)
        ? label.templateName[0]
        : label.templateName;
      const labelCode = label.labelCode ?? label.label ?? "";
      return {
        labelCode,
        articleId: article?.articleId ?? "",
        articleName: article?.articleName,
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
  return { labels: mapSeatLabels(raw), raw };
}

export { AimsClientError };
