import { DiscourseClient } from "@contentengine/discourse-api-client";
import { TopicMemoryDB } from "@contentengine/topic-memory-db";
import type { GeneratedArticle } from "./article-writer.js";
import type { EngineConfig } from "../config.js";

/** Result of the publishing pipeline */
export interface PublishResult {
  published: number;
  failed: number;
}

/**
 * Article Publisher pipeline.
 *
 * Takes generated articles and publishes them to a Discourse forum.
 * Tracks publication state in the database.
 */
export class ArticlePublisher {
  private client: DiscourseClient;
  private db: TopicMemoryDB;
  private config: EngineConfig;

  constructor(config: EngineConfig, db: TopicMemoryDB) {
    this.config = config;
    this.db = db;
    this.client = new DiscourseClient({
      baseUrl: config.discourse.baseUrl,
      apiKey: config.discourse.apiKey,
      apiUsername: config.discourse.apiUsername,
    });
  }

  /** Publish a batch of generated articles */
  async publish(articles: GeneratedArticle[]): Promise<PublishResult> {
    const result: PublishResult = { published: 0, failed: 0 };

    for (const article of articles) {
      try {
        console.log(`[publisher] Publishing: "${article.title}"...`);

        const topic = await this.client.createTopic({
          title: article.title,
          raw: article.body,
          categoryId: this.config.discourse.categoryId,
          tags: article.tags,
        });

        await this.db.insertPublishedArticle({
          contentPlanId: article.planItemId,
          discourseTopicId: topic.id,
          discoursePostId: topic.id, // First post ID matches topic ID in Discourse
          title: article.title,
        });

        await this.db.updateContentPlanStatus(article.planItemId, "published");
        result.published++;

        console.log(
          `[publisher] Published "${article.title}" as topic #${topic.id}`
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[publisher] Failed to publish "${article.title}": ${msg}`);
        result.failed++;
      }
    }

    console.log(
      `[publisher] Done: ${result.published} published, ${result.failed} failed`
    );
    return result;
  }
}
