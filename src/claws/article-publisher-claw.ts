import type { DraftArticle } from "@contentengine/topic-memory-db";
import type { ContentEngineRuntime } from "../runtime.js";

export interface ArticlePublisherClawResult {
  published: number;
  failed: number;
}

export class ArticlePublisherClaw {
  constructor(private readonly runtime: ContentEngineRuntime, private readonly categoryId: number) {}

  async run(): Promise<ArticlePublisherClawResult> {
    return this.publish();
  }

  async publish(): Promise<ArticlePublisherClawResult> {
    const drafts = await this.runtime.topicMemory.getDraftArticlesByStatus("ready");
    let published = 0;
    let failed = 0;

    for (const draft of drafts) {
      try {
        const topic = await this.runtime.discoursePublisher.run({
          title: draft.title,
          body: draft.body,
          categoryId: this.categoryId,
          tags: draft.tags,
        });

        await this.runtime.topicMemory.insertPublishedArticle({
          contentPlanId: draft.contentPlanId,
          discourseTopicId: topic.id,
          discoursePostId: topic.id,
          title: draft.title,
        });
        await this.runtime.topicMemory.updateDraftArticleStatus(draft.id, "published");
        await this.runtime.topicMemory.updateContentPlanStatus(draft.contentPlanId, "published");
        published++;
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        console.warn(`[discourse-publisher] Failed to publish "${draft.title}": ${message}`);
        failed++;
      }
    }

    return { published, failed };
  }

  async listReadyDrafts(): Promise<DraftArticle[]> {
    return this.runtime.topicMemory.getDraftArticlesByStatus("ready");
  }
}
