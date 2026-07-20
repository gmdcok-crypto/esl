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

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  retryOnUnauthorized?: boolean;
};

export class AimsClient {
  private readonly apiBaseUrl: string;
  private readonly storeId?: string;
  private readonly tenantId?: string;

  constructor() {
    const env = getEnv();
    this.apiBaseUrl = getAimsApiBaseUrl();
    this.storeId = env.AIMS_STORE_ID;
    this.tenantId = env.AIMS_TENANT_ID;
  }

  private buildUrl(path: string, query?: RequestOptions["query"]): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.apiBaseUrl}${normalizedPath}`);
    if (this.storeId) {
      url.searchParams.set("storeId", this.storeId);
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
    const { method = "GET", body, query, retryOnUnauthorized = true } = options;
    const accessToken = await getAimsAccessToken();

    const response = await fetch(this.buildUrl(path, query), {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(this.tenantId ? { "X-Tenant-Id": this.tenantId } : {}),
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
        `AIMS API request failed: ${response.status} ${response.statusText}`,
        response.status,
        payload as AimsApiError | undefined,
      );
    }

    return payload as T;
  }

  async getStore(): Promise<AimsStore> {
    return this.request<AimsStore>("/stores");
  }

  async listProducts(page = 1, pageSize = 50): Promise<AimsListResponse<AimsProduct>> {
    return this.request<AimsListResponse<AimsProduct>>("/articles", {
      query: { page, pageSize },
    });
  }

  async getProduct(productId: string): Promise<AimsProduct> {
    return this.request<AimsProduct>(`/articles/${productId}`);
  }

  async upsertProduct(payload: UpdateProductPayload): Promise<AimsProduct> {
    return this.request<AimsProduct>("/articles", {
      method: "PUT",
      body: payload,
    });
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
