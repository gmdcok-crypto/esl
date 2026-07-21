import { SignJWT, jwtVerify } from "jose";

const DEFAULT_TTL_SEC = 60 * 60 * 24 * 365 * 20; // 20 years (long-lived app token)

function getJwtSecret(): Uint8Array {
  const secret = process.env.APP_JWT_SECRET?.trim();
  if (!secret || secret.length < 16) {
    throw new Error("APP_JWT_SECRET must be set (min 16 characters)");
  }
  return new TextEncoder().encode(secret);
}

export function isAppAuthConfigured(): boolean {
  return Boolean(
    process.env.APP_JWT_SECRET?.trim() &&
      process.env.APP_USERNAME?.trim() &&
      process.env.APP_PASSWORD?.trim(),
  );
}

export function verifyAppCredentials(username: string, password: string): boolean {
  const expectedUser = process.env.APP_USERNAME?.trim();
  const expectedPass = process.env.APP_PASSWORD?.trim();
  if (!expectedUser || !expectedPass) return false;
  return username === expectedUser && password === expectedPass;
}

export async function signAppToken(username: string): Promise<string> {
  const ttl = Number(process.env.APP_JWT_TTL_SEC ?? DEFAULT_TTL_SEC);
  return new SignJWT({ sub: username, role: "operator" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(getJwtSecret());
}

export async function verifyAppToken(token: string): Promise<{ username: string }> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  const username = typeof payload.sub === "string" ? payload.sub : "";
  if (!username) {
    throw new Error("Invalid token subject");
  }
  return { username };
}

export function getBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}
