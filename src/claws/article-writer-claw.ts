import type { ContentPlanItem, DraftArticle, StoredArticle, StoredTopic } from "@openclaw/topic-memory-db";
import type { OpenClawRuntime } from "../runtime.js";

export interface ArticleWriterClawResult {
  drafts: DraftArticle[];
}

export class ArticleWriterClaw {
  constructor(private readonly runtime: OpenClawRuntime) {}

  async run(input?: { planId?: string }): Promise<ArticleWriterClawResult> {
    const approvedItems = await this.getPlanItems(input?.planId);
    const topics = await this.runtime.topicMemory.getAllTopics();
    const drafts: DraftArticle[] = [];

    for (const planItem of approvedItems) {
      const topic = topics.find((entry) => entry.id === planItem.topicId);
      if (!topic) continue;

      const sourceArticles = await this.getSourceArticles(topic);
      const draftPayload = await this.runtime.editorialIntelligence.writeDraft({
        planItem,
        topic,
        sourceArticles,
        humanComment: planItem.humanComment,
      });

      const draft = await this.runtime.topicMemory.insertDraftArticle({
        contentPlanId: planItem.id,
        topicId: topic.id,
        title: draftPayload.title,
        body: draftPayload.body,
        tags: draftPayload.tags,
        model: "gpt-4o-mini",
        status: draftPayload.readiness,
      });

      await this.runtime.topicMemory.updateContentPlanStatus(
        planItem.id,
        draftPayload.readiness === "ready" ? "ready" : "writing"
      );
      drafts.push(draft);
    }

    return { drafts };
  }

  private async getPlanItems(planId?: string): Promise<ContentPlanItem[]> {
    if (!planId) {
      return this.runtime.topicMemory.getContentPlanByStatus("approved");
    }
    const allItems = await this.runtime.topicMemory.getAllContentPlan();
    return allItems.filter((item) => item.id === planId && item.status === "approved");
  }

  private async getSourceArticles(topic: StoredTopic): Promise<StoredArticle[]> {
    const articleIds = await this.runtime.topicMemory.getTopicArticleIds(topic.id);
    const sourceArticles = await Promise.all(
      articleIds.slice(0, 6).map((articleId) => this.runtime.topicMemory.getArticleById(articleId))
    );
    return sourceArticles.filter((article): article is StoredArticle => article !== null);
  }
}
