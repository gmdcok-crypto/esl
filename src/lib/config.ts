import { z } from "zod";

const envSchema = z.object({
  AIMS_BASE_URL: z
    .string()
    .url()
    .refine((value) => /^https:\/\//.test(value) && !value.includes("\\"), {
      message: "AIMS_BASE_URL must be an https URL without Windows path prefixes",
    }),
  AIMS_USERNAME: z.string().min(1),
  AIMS_PASSWORD: z.string().min(1),
  AIMS_API_BASE_URL: z.string().url().optional(),
  AIMS_STORE_ID: z.string().optional(),
  AIMS_TENANT_ID: z.string().optional(),
  WEBHOOK_SECRET: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid environment variables: ${missing}`);
  }
  return parsed.data;
}

let cached: Env | null = null;

export function getEnv(): Env {
  if (!cached) {
    cached = loadEnv();
  }
  return cached;
}

export function getAimsApiBaseUrl(): string {
  const env = getEnv();
  return (env.AIMS_API_BASE_URL ?? `${env.AIMS_BASE_URL.replace(/\/$/, "")}/common/api/v2`).replace(/\/$/, "");
}

export function isAimsConfigured(): boolean {
  return Boolean(
    process.env.AIMS_BASE_URL &&
      process.env.AIMS_USERNAME &&
      process.env.AIMS_PASSWORD,
  );
}
