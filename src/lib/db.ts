import mysql, { type Pool, type PoolOptions } from "mysql2/promise";

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;
let activeSource: string | null = null;
let lastDatabaseError: string | null = null;

function trim(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function databaseUrlCandidates(): Array<{ source: string; url: string }> {
  return [
    { source: "MYSQL_PRIVATE_URL", url: trim(process.env.MYSQL_PRIVATE_URL) },
    { source: "MYSQL_URL", url: trim(process.env.MYSQL_URL) },
    { source: "MYSQL_PUBLIC_URL", url: trim(process.env.MYSQL_PUBLIC_URL) },
    { source: "DATABASE_URL", url: trim(process.env.DATABASE_URL) },
  ].filter((item): item is { source: string; url: string } => Boolean(item.url));
}

export function isDatabaseConfigured(): boolean {
  if (databaseUrlCandidates().length > 0) {
    return true;
  }
  const host = trim(process.env.MYSQLHOST) ?? trim(process.env.MYSQL_HOST);
  const user = trim(process.env.MYSQLUSER) ?? trim(process.env.MYSQL_USER);
  const password = trim(process.env.MYSQLPASSWORD) ?? trim(process.env.MYSQL_PASSWORD);
  const database = trim(process.env.MYSQLDATABASE) ?? trim(process.env.MYSQL_DATABASE);
  return Boolean(host && user && password && database);
}

export function getLastDatabaseError(): string | null {
  return lastDatabaseError;
}

export function getActiveDatabaseSource(): string | null {
  return activeSource;
}

function formatDbError(error: unknown): string {
  if (error instanceof Error) {
    const details = error as Error & { code?: string; errno?: number; sqlState?: string };
    const parts = [error.message || "Database connection failed"];
    if (details.code) parts.push(`code=${details.code}`);
    if (details.errno) parts.push(`errno=${details.errno}`);
    if (details.sqlState) parts.push(`sqlState=${details.sqlState}`);
    return parts.join(" | ");
  }
  return "Database connection failed";
}

function rememberDatabaseError(error: unknown): never {
  lastDatabaseError = formatDbError(error);
  throw error;
}

function resolveSsl(host: string): PoolOptions["ssl"] {
  const override = trim(process.env.MYSQL_SSL);
  if (override === "true") return { rejectUnauthorized: false };
  if (override === "false") return undefined;
  if (host.includes("railway.internal")) return undefined;
  if (host.includes("proxy.rlwy.net")) return undefined;
  return undefined;
}

function poolOptionsFromUrl(source: string, url: string): PoolOptions & { source: string } {
  const parsed = new URL(url);
  return {
    source,
    host: parsed.hostname,
    port: Number(parsed.port || "3306"),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 15_000,
    ssl: resolveSsl(parsed.hostname),
  };
}

function poolOptionsFromEnvVars(): (PoolOptions & { source: string }) | null {
  const host = trim(process.env.MYSQLHOST) ?? trim(process.env.MYSQL_HOST);
  const port = Number(trim(process.env.MYSQLPORT) ?? trim(process.env.MYSQL_PORT) ?? "3306");
  const user = trim(process.env.MYSQLUSER) ?? trim(process.env.MYSQL_USER);
  const password = trim(process.env.MYSQLPASSWORD) ?? trim(process.env.MYSQL_PASSWORD);
  const database = trim(process.env.MYSQLDATABASE) ?? trim(process.env.MYSQL_DATABASE);

  if (!host || !user || !password || !database) {
    return null;
  }

  return {
    source: "MYSQLHOST",
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    connectTimeout: 15_000,
    ssl: resolveSsl(host),
  };
}

function getConnectionCandidates(): Array<PoolOptions & { source: string }> {
  const candidates: Array<PoolOptions & { source: string }> = [];
  const seen = new Set<string>();

  const fromEnv = poolOptionsFromEnvVars();
  if (fromEnv) {
    candidates.push(fromEnv);
    seen.add(`${fromEnv.host}:${fromEnv.port}/${fromEnv.database}`);
  }

  for (const item of databaseUrlCandidates()) {
    const options = poolOptionsFromUrl(item.source, item.url);
    const key = `${options.host}:${options.port}/${options.database}`;
    if (!seen.has(key)) {
      candidates.push(options);
      seen.add(key);
    }
  }

  if (candidates.length === 0) {
    throw new Error(
      "MySQL is not configured. Link Railway MySQL to this service or set MYSQL_URL.",
    );
  }

  return candidates;
}

async function testPool(options: PoolOptions & { source: string }): Promise<Pool> {
  const { source, ...poolOptions } = options;
  const testPool = mysql.createPool(poolOptions);
  try {
    await testPool.query("SELECT 1");
    activeSource = source;
    lastDatabaseError = null;
    return testPool;
  } catch (error) {
    await testPool.end().catch(() => undefined);
    throw error;
  }
}

async function getOrCreatePool(): Promise<Pool> {
  if (pool) return pool;

  const candidates = getConnectionCandidates();
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      pool = await testPool(candidate);
      return pool;
    } catch (error) {
      errors.push(`${candidate.source}@${candidate.host}: ${formatDbError(error)}`);
    }
  }

  const message = errors.join(" || ");
  lastDatabaseError = message || "All database connection attempts failed";
  throw new Error(lastDatabaseError);
}

async function ensureSchema(): Promise<void> {
  const db = await getOrCreatePool();
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS meetings (
        id CHAR(36) PRIMARY KEY,
        meeting_name VARCHAR(255) NOT NULL,
        organizer_name VARCHAR(255) NOT NULL,
        attendees JSON NOT NULL,
        seats JSON NOT NULL,
        last_pushed_at DATETIME(3) NULL,
        last_push_status VARCHAR(16) NULL,
        last_push_error TEXT NULL,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        INDEX idx_meetings_updated (updated_at DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    lastDatabaseError = null;
  } catch (error) {
    rememberDatabaseError(error);
  }
}

export async function withDatabase<T>(fn: (db: Pool) => Promise<T>): Promise<T> {
  if (!isDatabaseConfigured()) {
    throw new Error("MySQL is not configured");
  }
  if (!schemaReady) {
    schemaReady = ensureSchema().catch((error) => {
      schemaReady = null;
      pool = null;
      throw error;
    });
  }
  try {
    await schemaReady;
    return await fn(await getOrCreatePool());
  } catch (error) {
    rememberDatabaseError(error);
  }
}

export async function pingDatabase(): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  try {
    await withDatabase(async (db) => {
      await db.query("SELECT 1");
    });
    return true;
  } catch {
    return false;
  }
}
