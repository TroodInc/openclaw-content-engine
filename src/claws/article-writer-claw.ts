import { randomUUID } from "node:crypto";
import type { ContentPlanItem, DraftArticle, StoredArticle, StoredTopic } from "@contentengine/topic-memory-db";
import type { ContentEngineRuntime } from "../runtime.js";

export interface ArticleWriterClawResult {
  drafts: DraftArticle[];
}

export class ArticleWriterClaw {
  constructor(private readonly runtime: ContentEngineRuntime) {}

  async run(input?: { planId?: string; topicQuery?: string }): Promise<ArticleWriterClawResult> {
    return this.write(input);
  }

  async write(input?: { planId?: string; topicQuery?: string }): Promise<ArticleWriterClawResult> {
    if (input?.topicQuery?.trim()) {
      return this.writeFromQuery(input.topicQuery);
    }

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

  async writeFromQuery(topicQuery: string): Promise<ArticleWriterClawResult> {
    const embedding = await this.runtime.semanticUtils.embed(topicQuery);
    const nearest = await this.runtime.topicMemory.findNearestEmbeddings(embedding.embedding, 8);
    const seenArticleIds = new Set<string>();
    const sourceArticles: StoredArticle[] = [];

    for (const item of nearest) {
      if (seenArticleIds.has(item.articleId)) continue;
      seenArticleIds.add(item.articleId);
      const article = await this.runtime.topicMemory.getArticleById(item.articleId);
      if (article) sourceArticles.push(article);
      if (sourceArticles.length >= 6) break;
    }

    if (sourceArticles.length === 0) {
      return { drafts: [] };
    }

    const topic = await this.runtime.topicMemory.upsertTopic({
      id: randomUUID(),
      name: topicQuery.trim(),
      description: `User-requested topic grounded in nearest analyzed articles for: ${topicQuery.trim()}`,
      centroidEmbedding: embedding.embedding,
      articleCount: sourceArticles.length,
    });

    for (const article of sourceArticles) {
      const articleEmbedding = await this.runtime.topicMemory.getEmbeddingByArticleId(article.id);
      const similarity = articleEmbedding
        ? this.runtime.semanticUtils.similarity(articleEmbedding.embedding, embedding.embedding)
        : 0;
      await this.runtime.topicMemory.linkArticleToTopic({
        topicId: topic.id,
        articleId: article.id,
        similarity,
      });
    }

    const planItem = await this.runtime.topicMemory.insertContentPlanItem({
      topicId: topic.id,
      status: "approved",
      priority: 100,
      humanComment: `Requested topic query: ${topicQuery.trim()}`,
    });

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

    return { drafts: [draft] };
  }

  async writeAbout(topicName: string): Promise<ArticleWriterClawResult> {
    const topics = await this.runtime.topicMemory.getAllTopics();
    const matchedTopic = topics.find((topic) => topic.name.toLowerCase().includes(topicName.toLowerCase()));
    if (!matchedTopic) {
      return { drafts: [] };
    }

    const allPlanItems = await this.runtime.topicMemory.getAllContentPlan();
    let planItem = allPlanItems.find(
      (item) => item.topicId === matchedTopic.id && (item.status === "approved" || item.status === "draft")
    );

    if (!planItem) {
      planItem = await this.runtime.topicMemory.insertContentPlanItem({
        topicId: matchedTopic.id,
        status: "approved",
        priority: 100,
        humanComment: `Requested from chat for topic: ${topicName}`,
      });
    } else if (planItem.status === "draft") {
      await this.runtime.topicMemory.updateContentPlanItem(planItem.id, {
        status: "approved",
        humanComment: planItem.humanComment || `Requested from chat for topic: ${topicName}`,
      });
    }

    return this.write({ planId: planItem.id });
  }

  private async getPlanItems(planId?: string): Promise<ContentPlanItem[]> {
    if (!planId) {
      const approvedItems = await this.runtime.topicMemory.getContentPlanByStatus("approved");
      if (approvedItems.length > 0) {
        return approvedItems;
      }

      const draftItems = await this.runtime.topicMemory.getContentPlanByStatus("draft");
      return draftItems.slice(0, 1);
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
