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
  /** Articles API uses stationCode in body instead of storeId query. */
  skipStoreQuery?: boolean;
};

export class AimsClient {
  private readonly apiBaseUrl: string;
  private readonly storeId?: string;
  private readonly tenantId?: string;
  private readonly companyCode?: string;

  constructor() {
    const env = getEnv();
    this.apiBaseUrl = getAimsApiBaseUrl();
    this.storeId = env.AIMS_STORE_ID;
    this.tenantId = env.AIMS_TENANT_ID;
    this.companyCode = env.AIMS_COMPANY_CODE;
  }

  private buildUrl(path: string, query?: RequestOptions["query"], skipStoreQuery = false): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.apiBaseUrl}${normalizedPath}`);
    if (this.storeId && !skipStoreQuery) {
      url.searchParams.set("storeId", this.storeId);
    }
    if (this.companyCode) {
      url.searchParams.set("companyCode", this.companyCode);
    }
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", body, query, retryOnUnauthorized = true, skipStoreQuery = false } = options;
    const accessToken = await getAimsAccessToken();

    const response = await fetch(this.buildUrl(path, query, skipStoreQuery), {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(this.tenantId ? { "X-Tenant-Id": this.tenantId } : {}),
        ...(this.companyCode
          ? {
              "Company-Code": this.companyCode,
              companyCode: this.companyCode,
              CustomerCode: this.companyCode,
            }
          : {}),
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
        getApiErrorMessage(payload as AimsApiError | undefined, `AIMS API request failed: ${response.status} ${response.statusText}`),
        response.status,
        payload as AimsApiError | undefined,
      );
    }

    return unwrapAimsResponse<T>(payload);
  }

  async listStores(): Promise<AimsStore[]> {
    const stores = await this.request<AimsStore[] | { stores?: AimsStore[] }>("/common/store");
    if (Array.isArray(stores)) {
      return stores;
    }
    return stores.stores ?? [];
  }

  async getStore(): Promise<AimsStore | null> {
    const stores = await this.listStores();
    return stores[0] ?? null;
  }

  private articleQuery(page?: number, pageSize?: number): Record<string, string | number | undefined> {
    return {
      ...(this.storeId ? { stationCode: this.storeId, storeId: this.storeId } : {}),
      ...(page !== undefined ? { page } : {}),
      ...(pageSize !== undefined ? { pageSize } : {}),
    };
  }

  async listProducts(page = 1, pageSize = 50): Promise<AimsListResponse<AimsProduct>> {
    return this.request<AimsListResponse<AimsProduct>>("/common/articles", {
      query: this.articleQuery(page, pageSize),
      skipStoreQuery: true,
    });
  }

  async getProduct(articleId: string): Promise<AimsProduct> {
    return this.request<AimsProduct>("/common/articles/id", {
      query: { ...this.articleQuery(), id: articleId },
      skipStoreQuery: true,
    });
  }

  async createProduct(payload: UpdateProductPayload): Promise<AimsProduct> {
    return this.request<AimsProduct>("/common/articles", {
      method: "POST",
      body: payload,
      skipStoreQuery: true,
    });
  }

  async updateProduct(payload: UpdateProductPayload): Promise<AimsProduct> {
    return this.request<AimsProduct>("/common/articles", {
      method: "PUT",
      body: payload,
      skipStoreQuery: true,
    });
  }

  async upsertMeetingArticle(payload: AimsMeetingArticlePayload): Promise<unknown> {
    try {
      return await this.request("/common/articles", {
        method: "PUT",
        body: payload,
        skipStoreQuery: true,
      });
    } catch (error) {
      if (error instanceof AimsClientError && (error.status === 404 || error.status === 400)) {
        return this.request("/common/articles", {
          method: "POST",
          body: payload,
          skipStoreQuery: true,
        });
      }
      throw error;
    }
  }

  async upsertProduct(payload: UpdateProductPayload): Promise<AimsProduct> {
    return this.updateProduct(payload);
  }

  async listLabels(page = 1, pageSize = 50): Promise<AimsListResponse<AimsLabel>> {
    return this.request<AimsListResponse<AimsLabel>>("/labels", {
      query: { page, pageSize },
    });
  }

  async assignLabel(payload: AssignLabelPayload): Promise<AimsLabel> {
    return this.request<AimsLabel>("/labels/assign", {
      method: "POST",
      body: payload,
    });
  }

  async refreshLabel(labelId: string): Promise<void> {
    await this.request(`/labels/${labelId}/refresh`, { method: "POST" });
  }
}

let client: AimsClient | null = null;

export function getAimsClient(): AimsClient {
  if (!client) {
    client = new AimsClient();
  }
  return client;
}
