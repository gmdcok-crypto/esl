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

type TokenPayload = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
};

type TokenResponse = TokenPayload & {
  responseCode?: string | number;
  responseMessage?: string | TokenPayload;
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

function normalizeTokenPayload(payload: TokenResponse): TokenPayload {
  if (payload.access_token) {
    return payload;
  }

  if (payload.responseMessage && typeof payload.responseMessage === "object") {
    return payload.responseMessage;
  }

  return payload;
}

function getErrorMessage(payload: TokenResponse): string {
  if (typeof payload.responseMessage === "string") {
    return payload.responseMessage;
  }

  return "AIMS token response did not include access_token";
}

function isSuccessResponse(payload: TokenResponse): boolean {
  const token = normalizeTokenPayload(payload);
  if (payload.responseCode === undefined) {
    return Boolean(token.access_token);
  }
  return String(payload.responseCode) === "200" && Boolean(token.access_token);
}

function extractToken(payload: TokenResponse): CachedToken {
  const token = normalizeTokenPayload(payload);

  if (!isSuccessResponse(payload) || !token.access_token) {
    throw new AimsAuthError(getErrorMessage(payload), 500, {
      responseCode: payload.responseCode,
      responseMessage:
        typeof payload.responseMessage === "string" ? payload.responseMessage : "[redacted]",
    });
  }

  const expiresInSec = token.expires_in ?? DEFAULT_TOKEN_TTL_SEC;
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + expiresInSec * 1000 - TOKEN_EXPIRY_BUFFER_MS,
  };
}

async function postTokenRequest(path: string, body: Record<string, string>): Promise<CachedToken> {
  const url = `${getAimsApiBaseUrl()}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AimsAuthError(`Failed to reach AIMS auth API (${url}): ${reason}`, 502);
  }

  const text = await response.text();
  const payload = parseJson(text) as TokenResponse;

  if (!response.ok || !isSuccessResponse(payload)) {
    throw new AimsAuthError(
      getErrorMessage(payload) || `AIMS auth failed: ${response.status} ${response.statusText}`,
      response.status,
      {
        responseCode: payload.responseCode,
        responseMessage:
          typeof payload.responseMessage === "string" ? payload.responseMessage : "[redacted]",
      },
    );
  }

  return extractToken(payload);
}

async function loginWithCredentials(): Promise<CachedToken> {
  const env = getEnv();
  const body: Record<string, string> = {
    username: env.AIMS_USERNAME,
    password: env.AIMS_PASSWORD,
  };
  if (env.AIMS_COMPANY_CODE) {
    body.companyCode = env.AIMS_COMPANY_CODE;
  }
  return postTokenRequest("/token", body);
}

async function refreshAccessToken(refreshToken: string): Promise<CachedToken> {
  const env = getEnv();
  const body: Record<string, string> = { refreshToken };
  if (env.AIMS_COMPANY_CODE) {
    body.companyCode = env.AIMS_COMPANY_CODE;
  }
  return postTokenRequest("/token/refresh", body);
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
