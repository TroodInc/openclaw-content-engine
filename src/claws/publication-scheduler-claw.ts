import type { ContentPlanItem, StoredArticle, StoredEmbedding, StoredTopic } from "@openclaw/topic-memory-db";
import type { OpenClawRuntime } from "../runtime.js";
import type { ScheduleDecision } from "../skills/editorial-intelligence-skill.js";

export interface ScheduledArticleTask {
  planItem: ContentPlanItem;
  rationale: string;
}

export interface PublicationSchedulerClawResult {
  scheduled: ScheduledArticleTask[];
  totalDraft: number;
}

export class PublicationSchedulerClaw {
  constructor(private readonly runtime: OpenClawRuntime) {}

  async run(input?: { humanComment?: string; maxItems?: number }): Promise<PublicationSchedulerClawResult> {
    return this.schedule(input);
  }

  async schedule(input?: { humanComment?: string; maxItems?: number }): Promise<PublicationSchedulerClawResult> {
    const topics = await this.runtime.topicMemory.getAllTopics();
    const articles = await this.runtime.topicMemory.getAllArticles();
    const embeddings = await this.runtime.topicMemory.getAllEmbeddings();
    const contentPlan = await this.runtime.topicMemory.getAllContentPlan();
    const published = await this.runtime.topicMemory.getPublishedArticles();

    const scheduledTopicIds = new Set(
      contentPlan
        .filter((item) => item.status !== "skipped")
        .map((item) => item.topicId)
    );

    const coveredTopicIds = new Set(
      contentPlan
        .filter((item) => item.status === "published")
        .map((item) => item.topicId)
    );

    const clusteredTopicIds = this.clusterTopicCandidates(topics, embeddings);
    const candidates = await Promise.all(
      topics
        .filter((topic) => !scheduledTopicIds.has(topic.id) || clusteredTopicIds.has(topic.id))
        .map(async (topic) => ({
          topic,
          articleTitles: await this.getTopicArticleTitles(topic, articles),
          alreadyCovered: coveredTopicIds.has(topic.id) || published.some((item) => item.title.includes(topic.name)),
        }))
    );

    const decisions = await this.runtime.editorialIntelligence.run({
      candidates,
      maxItems: input?.maxItems ?? 5,
      humanComment: input?.humanComment,
    });

    const scheduled: ScheduledArticleTask[] = [];
    for (const decision of decisions) {
      if (scheduledTopicIds.has(decision.topicId)) continue;
      const planItem = await this.runtime.topicMemory.insertContentPlanItem({
        topicId: decision.topicId,
        status: "draft",
        priority: decision.priority,
        humanComment: input?.humanComment,
        scheduledDate: decision.scheduledDate,
      });
      scheduled.push({ planItem, rationale: decision.rationale });
    }

    return {
      scheduled,
      totalDraft: (await this.runtime.topicMemory.getContentPlanByStatus("draft")).length,
    };
  }

  async showPlan(): Promise<ContentPlanItem[]> {
    return this.runtime.topicMemory.getAllContentPlan();
  }

  async approve(planId: string, comment?: string): Promise<void> {
    await this.runtime.topicMemory.updateContentPlanItem(planId, {
      status: "approved",
      humanComment: comment,
    });
  }

  async skip(planId: string): Promise<void> {
    await this.runtime.topicMemory.updateContentPlanStatus(planId, "skipped");
  }

  private clusterTopicCandidates(topics: StoredTopic[], embeddings: StoredEmbedding[]): Set<string> {
    if (embeddings.length === 0) return new Set();
    const clusters = this.runtime.semanticUtils.cluster({
      embeddings: embeddings.map((embedding) => embedding.embedding),
      threshold: 0.78,
    });
    const clustered = new Set<string>();
    for (const cluster of clusters) {
      if (cluster.members.length < 2) continue;
      for (const topic of topics) {
        const similarity = this.runtime.semanticUtils.similarity(
          topic.centroidEmbedding,
          cluster.centroid
        );
        if (similarity > 0.8) clustered.add(topic.id);
      }
    }
    return clustered;
  }

  private async getTopicArticleTitles(topic: StoredTopic, articles: StoredArticle[]): Promise<string[]> {
    const articleIds = await this.runtime.topicMemory.getTopicArticleIds(topic.id);
    const articleMap = new Map(articles.map((article) => [article.id, article.title]));
    return articleIds.map((id) => articleMap.get(id)).filter((title): title is string => Boolean(title));
  }
}
