import type { DraftArticle } from "@openclaw/topic-memory-db";
import type { OpenClawRuntime } from "../runtime.js";

export interface ArticlePublisherClawResult {
  published: number;
  failed: number;
}

export class ArticlePublisherClaw {
  constructor(private readonly runtime: OpenClawRuntime, private readonly categoryId: number) {}

  async run(): Promise<ArticlePublisherClawResult> {
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
      } catch {
        failed++;
      }
    }

    return { published, failed };
  }

  async listReadyDrafts(): Promise<DraftArticle[]> {
    return this.runtime.topicMemory.getDraftArticlesByStatus("ready");
  }
}
