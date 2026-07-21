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
  networkStatus?: boolean;
  battery?: string;
  type?: string;
  templateName?: string[] | string;
  gateway?: { name?: string };
  articleList?: Array<{ articleId?: string; articleName?: string }>;
};

export async function listSeatLabels(): Promise<SeatLabel[]> {
  const aims = getAimsClient();
  const raw = (await aims.listLabels(1, 100)) as unknown;

  const labelList = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && "labelList" in raw
      ? ((raw as { labelList?: AimsLabelRaw[] }).labelList ?? [])
      : raw && typeof raw === "object" && "items" in raw
        ? ((raw as { items?: AimsLabelRaw[] }).items ?? [])
        : [];

  return labelList
    .map((label) => {
      const article = label.articleList?.[0];
      const template = Array.isArray(label.templateName)
        ? label.templateName[0]
        : label.templateName;
      return {
        labelCode: label.labelCode ?? "",
        articleId: article?.articleId ?? "",
        articleName: article?.articleName,
        online: Boolean(label.networkStatus),
        battery: label.battery,
        gatewayName: label.gateway?.name,
        type: label.type,
        templateName: template,
      };
    })
    .filter((label) => label.labelCode);
}

export { AimsClientError };
