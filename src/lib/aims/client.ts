import { getAimsApiBaseUrl, getEnv } from "@/lib/config";
import { getAimsAccessToken, invalidateAimsAccessToken } from "@/lib/aims/auth";
import type {
  AimsApiError,
  AimsLabel,
  AimsListResponse,
  AimsProduct,
  AimsStore,
  AssignLabelPayload,
  UpdateProductPayload,
} from "./types";
import type { AimsMeetingArticlePayload } from "./meeting";

export class AimsClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: AimsApiError,
  ) {
    super(message);
    this.name = "AimsClientError";
  }
}

type AimsEnvelope<T> = {
  responseCode?: string | number;
  responseMessage?: T;
};

function unwrapAimsResponse<T>(payload: unknown): T {
  if (payload && typeof payload === "object" && "responseMessage" in payload) {
    const envelope = payload as AimsEnvelope<T>;
    if (envelope.responseMessage !== undefined) {
      return envelope.responseMessage;
    }
  }
  return payload as T;
}

function getApiErrorMessage(payload: AimsApiError | undefined, fallback: string): string {
  if (!payload) return fallback;
  if (typeof payload.responseMessage === "string") return payload.responseMessage;
  if (typeof payload.message === "string") return payload.message;
  return fallback;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  retryOnUnauthorized?: boolean;
};

export class AimsClient {
  private readonly apiBaseUrl: string;
  private readonly storeCode?: string;
  private readonly companyCode?: string;

  constructor() {
    const env = getEnv();
    this.apiBaseUrl = getAimsApiBaseUrl();
    this.storeCode = env.AIMS_STORE_ID;
    this.companyCode = env.AIMS_COMPANY_CODE;
  }

  /** AIMS SaaS docs: required query params are `company` and `store`. */
  private requiredQuery(): Record<string, string> {
    const query: Record<string, string> = {};
    if (this.companyCode) query.company = this.companyCode;
    if (this.storeCode) query.store = this.storeCode;
    return query;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.apiBaseUrl}${normalizedPath}`);
    const merged = { ...this.requiredQuery(), ...query };
    for (const [key, value] of Object.entries(merged)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, query, retryOnUnauthorized = true } = options;
    const accessToken = await getAimsAccessToken();

    const response = await fetch(this.buildUrl(path, query), {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new AimsClientError(
          `AIMS API returned non-JSON response: ${response.status}`,
          response.status,
        );
      }
    }

    if (response.status === 401 && retryOnUnauthorized) {
      invalidateAimsAccessToken();
      return this.request<T>(path, { ...options, retryOnUnauthorized: false });
    }

    if (!response.ok) {
      throw new AimsClientError(
        getApiErrorMessage(
          payload as AimsApiError | undefined,
          `AIMS API request failed: ${response.status} ${response.statusText}`,
        ),
        response.status,
        payload as AimsApiError | undefined,
      );
    }

    return unwrapAimsResponse<T>(payload);
  }

  async listStores(): Promise<AimsStore[]> {
    const stores = await this.request<AimsStore[] | AimsStore | { stores?: AimsStore[] }>("/common/store");
    if (Array.isArray(stores)) return stores;
    if (stores && typeof stores === "object" && "stores" in stores) {
      return stores.stores ?? [];
    }
    return stores ? [stores as AimsStore] : [];
  }

  async getStore(): Promise<AimsStore | null> {
    const stores = await this.listStores();
    return stores[0] ?? null;
  }

  async listProducts(page = 1, pageSize = 50): Promise<AimsListResponse<AimsProduct>> {
    return this.request<AimsListResponse<AimsProduct>>("/common/articles", {
      query: { page, size: pageSize },
    });
  }

  async getProduct(articleId: string): Promise<AimsProduct> {
    return this.request<AimsProduct>("/common/articles", {
      query: { articleId },
    });
  }

  async createProduct(payload: UpdateProductPayload): Promise<AimsProduct> {
    return this.request<AimsProduct>("/common/articles", {
      method: "POST",
      body: payload,
    });
  }

  async updateProduct(payload: UpdateProductPayload): Promise<AimsProduct> {
    return this.request<AimsProduct>("/common/articles", {
      method: "PUT",
      body: payload,
    });
  }

  async upsertMeetingArticle(payload: AimsMeetingArticlePayload): Promise<unknown> {
    try {
      return await this.request("/common/articles", {
        method: "PUT",
        body: payload,
      });
    } catch (error) {
      if (error instanceof AimsClientError && (error.status === 404 || error.status === 400 || error.status === 405)) {
        return this.request("/common/articles", {
          method: "POST",
          body: payload,
        });
      }
      throw error;
    }
  }

  async upsertProduct(payload: UpdateProductPayload): Promise<AimsProduct> {
    return this.updateProduct(payload);
  }

  async listLabels(page = 1, pageSize = 50): Promise<AimsListResponse<AimsLabel>> {
    return this.request<AimsListResponse<AimsLabel>>("/common/labels", {
      query: { page, size: pageSize },
    });
  }

  async assignLabel(payload: AssignLabelPayload): Promise<AimsLabel> {
    return this.request<AimsLabel>("/common/labels/link", {
      method: "POST",
      body: payload,
    });
  }

  async refreshLabel(labelId: string): Promise<void> {
    await this.request("/common/labels", {
      method: "GET",
      query: { label: labelId },
    });
  }
}

let client: AimsClient | null = null;

export function getAimsClient(): AimsClient {
  if (!client) {
    client = new AimsClient();
  }
  return client;
}

/** Reset singleton (tests / after env changes). */
export function resetAimsClient(): void {
  client = null;
}
