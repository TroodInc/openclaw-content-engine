import type { TelegramReaderConfig } from "@openclaw/telegram-channel-reader";
import type { DiscourseConfig } from "@openclaw/discourse-api-client";
import type { EmbeddingServiceConfig } from "@openclaw/semantic-skills";

/** Full engine configuration */
export interface EngineConfig {
  telegram: TelegramReaderConfig;
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
