import mysql, { type PoolOptions } from "mysql2/promise";

let pool: mysql.Pool | null = null;
let schemaReady: Promise<void> | null = null;
let lastDatabaseError: string | null = null;

function trim(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function databaseUrlCandidates(): string[] {
  return [
    trim(process.env.MYSQL_PRIVATE_URL),
    trim(process.env.MYSQL_URL),
    trim(process.env.MYSQL_PUBLIC_URL),
    trim(process.env.DATABASE_URL),
  ].filter((value): value is string => Boolean(value));
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

function resolveSsl(host: string): PoolOptions["ssl"] {
  const override = trim(process.env.MYSQL_SSL);
  if (override === "true") return { rejectUnauthorized: false };
  if (override === "false") return undefined;

  // Railway private network MySQL does not use TLS at the protocol layer.
  if (host.includes("railway.internal")) return undefined;

  return undefined;
}

function poolOptionsFromUrl(url: string): PoolOptions {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || "3306"),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    waitForConnections: true,
    connectionLimit: 10,
    ssl: resolveSsl(parsed.hostname),
  };
}

function poolOptionsFromEnvVars(): PoolOptions | null {
  const host = trim(process.env.MYSQLHOST) ?? trim(process.env.MYSQL_HOST);
  const port = Number(trim(process.env.MYSQLPORT) ?? trim(process.env.MYSQL_PORT) ?? "3306");
  const user = trim(process.env.MYSQLUSER) ?? trim(process.env.MYSQL_USER);
  const password = trim(process.env.MYSQLPASSWORD) ?? trim(process.env.MYSQL_PASSWORD);
  const database = trim(process.env.MYSQLDATABASE) ?? trim(process.env.MYSQL_DATABASE);

  if (!host || !user || !password || !database) {
    return null;
  }

  return {
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    ssl: resolveSsl(host),
  };
}

function getPoolOptions(): PoolOptions {
  const fromEnv = poolOptionsFromEnvVars();
  if (fromEnv) {
    return fromEnv;
  }

  const url = databaseUrlCandidates()[0];
  if (url) {
    return poolOptionsFromUrl(url);
  }

  throw new Error(
    "MySQL is not configured. Link Railway MySQL to this service or set MYSQL_URL.",
  );
}

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(getPoolOptions());
  }
  return pool;
}

function rememberDatabaseError(error: unknown): never {
  lastDatabaseError = error instanceof Error ? error.message : "Database connection failed";
  throw error;
}

async function ensureSchema(): Promise<void> {
  const db = getPool();
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

export async function withDatabase<T>(fn: (db: mysql.Pool) => Promise<T>): Promise<T> {
  if (!isDatabaseConfigured()) {
    throw new Error("MySQL is not configured");
  }
  if (!schemaReady) {
    schemaReady = ensureSchema().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  try {
    await schemaReady;
    return await fn(getPool());
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
    lastDatabaseError = null;
    return true;
  } catch {
    return false;
  }
}
