import type { TelegramReaderConfig } from "@contentengine/telegram-channel-reader";
import type { DiscourseConfig } from "@contentengine/discourse-api-client";
import type { EmbeddingServiceConfig } from "@contentengine/semantic-skills";

/** Full engine configuration */
export interface EngineConfig {
  telegram: TelegramReaderConfig;
  extractor: {
    timeout: number;
    maxLength: number;
    caCertPath?: string;
    headers: Record<string, string>;
  };
  openai: {
    apiKey: string;
    model?: string;
    embeddingModel?: string;
  };
  discourse: DiscourseConfig & {
    categoryId: number;
  };
  embedding: EmbeddingServiceConfig;
  db: {
    connectionString: string;
  };
}

function parseHeaders(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const parsed = JSON.parse(raw) as Record<string, string>;
  return Object.fromEntries(
    Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
  );
}

/** Load configuration from environment variables */
export function loadConfig(): EngineConfig {
  const env = process.env;

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  const telegramApiId = env.TELEGRAM_API_ID;
  const telegramApiHash = env.TELEGRAM_API_HASH;
  const telegramChannel = env.TELEGRAM_CHANNEL;

  if (!telegramApiId || !telegramApiHash || !telegramChannel) {
    throw new Error("TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_CHANNEL are required");
  }

  return {
    telegram: {
      apiId: parseInt(telegramApiId, 10),
      apiHash: telegramApiHash,
      session: env.TELEGRAM_SESSION || undefined,
      channel: telegramChannel,
    },
    extractor: {
      timeout: parseInt(env.ARTICLE_EXTRACTOR_TIMEOUT_MS || "15000", 10),
      maxLength: parseInt(env.ARTICLE_EXTRACTOR_MAX_LENGTH || "50000", 10),
      caCertPath: env.ARTICLE_EXTRACTOR_CA_CERT_PATH || env.NODE_EXTRA_CA_CERTS || undefined,
      headers: {
        ...(env.ARTICLE_EXTRACTOR_USER_AGENT ? { "user-agent": env.ARTICLE_EXTRACTOR_USER_AGENT } : {}),
        ...(env.ARTICLE_EXTRACTOR_COOKIE ? { cookie: env.ARTICLE_EXTRACTOR_COOKIE } : {}),
        ...parseHeaders(env.ARTICLE_EXTRACTOR_HEADERS_JSON),
      },
    },
    openai: {
      apiKey,
      model: env.OPENAI_MODEL || "gpt-4o-mini",
      embeddingModel: env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    },
    discourse: {
      baseUrl: env.DISCOURSE_URL || "",
      apiKey: env.DISCOURSE_API_KEY || "",
      apiUsername: env.DISCOURSE_USERNAME || "",
      categoryId: parseInt(env.DISCOURSE_CATEGORY_ID || "0", 10),
    },
    embedding: {
      apiKey,
      model: env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    },
    db: {
      connectionString: env.DATABASE_URL || "postgresql://localhost:5432/openclaw",
    },
  };
}
