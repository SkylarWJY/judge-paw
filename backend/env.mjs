import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export function loadDotEnv(filePath = ".env.local") {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    // Local env is optional. Missing API keys should fall back gracefully.
  }
}

function numberEnv(key, fallback) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) ? value : fallback;
}

function stringEnv(key, fallback = "") {
  const value = process.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

loadDotEnv();

const dataDir = stringEnv("DATA_DIR", path.join(process.cwd(), ".local-data"));
mkdirSync(dataDir, { recursive: true });

export const config = {
  host: stringEnv("HOST", "127.0.0.1"),
  port: numberEnv("PORT", 3000),
  databasePath: stringEnv("LOCAL_DATABASE_PATH", path.join(dataDir, "judge-paw.sqlite")),
  anthropic: {
    apiKey: stringEnv("ANTHROPIC_API_KEY"),
    model: stringEnv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
    apiUrl: stringEnv("ANTHROPIC_API_URL", "https://api.anthropic.com/v1/messages"),
    version: stringEnv("ANTHROPIC_VERSION", "2023-06-01")
  },
  quotas: {
    free: numberEnv("FREE_MONTHLY_VERDICTS", 5),
    member: numberEnv("MEMBER_MONTHLY_VERDICTS", 100),
    pro: numberEnv("PRO_MONTHLY_VERDICTS", -1)
  },
  cloud: {
    aws: {
      region: stringEnv("AWS_REGION", "us-east-1"),
      backendTarget: stringEnv("AWS_BACKEND_TARGET", "ecs-fargate"),
      apiEndpoint: stringEnv("AWS_API_ENDPOINT")
    },
    cloudflare: {
      accountId: stringEnv("CLOUDFLARE_ACCOUNT_ID"),
      d1DatabaseId: stringEnv("CLOUDFLARE_D1_DATABASE_ID"),
      d1DatabaseName: stringEnv("CLOUDFLARE_D1_DATABASE_NAME", "judge-paw"),
      workerEndpoint: stringEnv("CLOUDFLARE_WORKER_ENDPOINT")
    }
  }
};
