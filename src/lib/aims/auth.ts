import { getAimsApiBaseUrl, getEnv } from "@/lib/config";

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_TTL_SEC = 3600;

export class AimsAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "AimsAuthError";
  }
}

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  responseCode?: string | number;
  responseMessage?: string;
};

type CachedToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;
let loginPromise: Promise<string> | null = null;

function parseJson(text: string): unknown {
  return text ? JSON.parse(text) : null;
}

function isSuccessResponse(payload: TokenResponse): boolean {
  if (payload.responseCode === undefined) {
    return Boolean(payload.access_token);
  }
  return String(payload.responseCode) === "200";
}

function extractToken(payload: TokenResponse): CachedToken {
  if (!isSuccessResponse(payload) || !payload.access_token) {
    throw new AimsAuthError(
      payload.responseMessage ?? "AIMS token response did not include access_token",
      500,
      payload,
    );
  }

  const expiresInSec = payload.expires_in ?? DEFAULT_TOKEN_TTL_SEC;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresAt: Date.now() + expiresInSec * 1000 - TOKEN_EXPIRY_BUFFER_MS,
  };
}

async function postTokenRequest(path: string, body: Record<string, string>): Promise<CachedToken> {
  const response = await fetch(`${getAimsApiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const text = await response.text();
  const payload = parseJson(text) as TokenResponse;

  if (!response.ok || !isSuccessResponse(payload)) {
    throw new AimsAuthError(
      payload.responseMessage ?? `AIMS auth failed: ${response.status} ${response.statusText}`,
      response.status,
      payload,
    );
  }

  return extractToken(payload);
}

async function loginWithCredentials(): Promise<CachedToken> {
  const env = getEnv();
  return postTokenRequest("/token", {
    username: env.AIMS_USERNAME,
    password: env.AIMS_PASSWORD,
  });
}

async function refreshAccessToken(refreshToken: string): Promise<CachedToken> {
  return postTokenRequest("/token/refresh", { refreshToken });
}

async function acquireToken(force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  if (cachedToken?.refreshToken) {
    try {
      cachedToken = await refreshAccessToken(cachedToken.refreshToken);
      return cachedToken.accessToken;
    } catch {
      cachedToken = null;
    }
  }

  cachedToken = await loginWithCredentials();
  return cachedToken.accessToken;
}

export async function getAimsAccessToken(force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  if (!loginPromise) {
    loginPromise = acquireToken(force).finally(() => {
      loginPromise = null;
    });
  }

  return loginPromise;
}

export function invalidateAimsAccessToken(): void {
  cachedToken = null;
  loginPromise = null;
}
