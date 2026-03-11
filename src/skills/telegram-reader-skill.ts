import { TelegramChannelReader } from "@contentengine/telegram-channel-reader";
import type { TelegramPost, TelegramReaderConfig } from "@contentengine/telegram-channel-reader";
import type { ContentEngineSkill } from "./skill.js";

export interface FetchTelegramPostsInput {
  sinceId: number;
  limit?: number;
}

export interface FetchTelegramPostsOutput {
  posts: TelegramPost[];
  lastId: number;
  session?: string;
}

export class TelegramReaderSkill
  implements ContentEngineSkill<FetchTelegramPostsInput, FetchTelegramPostsOutput>
{
  readonly name = "telegram_reader";
  readonly description = "Read Telegram channel posts incrementally.";

  private readonly reader: TelegramChannelReader;

  constructor(config: TelegramReaderConfig) {
    this.reader = new TelegramChannelReader(config);
  }

  async run(input: FetchTelegramPostsInput): Promise<FetchTelegramPostsOutput> {
    const result = await this.reader.fetchPosts(input.sinceId, input.limit ?? 100);
    return {
      posts: result.posts,
      lastId: result.lastId,
      session: this.reader.getSession() || undefined,
    };
  }

  async disconnect(): Promise<void> {
    await this.reader.disconnect();
  }
}
