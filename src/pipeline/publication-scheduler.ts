import { TopicMemoryDB } from "@openclaw/topic-memory-db";
import type { StoredTopic, ContentPlanItem } from "@openclaw/topic-memory-db";
import type { EngineConfig } from "../config.js";

/** Result of the scheduling pipeline */
export interface ScheduleResult {
  newPlanItems: number;
  totalPending: number;
}

/**
 * Publication Scheduler pipeline.
 *
 * Analyzes discovered topics, prioritizes them by article count
 * and recency, and creates content plan items for topics that
 * haven't been scheduled yet.
 */
export class PublicationScheduler {
  private db: TopicMemoryDB;
  private config: EngineConfig;

  constructor(config: EngineConfig, db: TopicMemoryDB) {
    this.config = config;
    this.db = db;
  }

  /** Run the scheduling pipeline */
  async run(): Promise<ScheduleResult> {
    const result: ScheduleResult = { newPlanItems: 0, totalPending: 0 };

    console.log("[scheduler] Analyzing topics for content plan...");
    const topics = await this.db.getAllTopics();
    const existingPlan = await this.db.getAllContentPlan();
    const scheduledTopicIds = new Set(existingPlan.map((p) => p.topicId));

    // Find unscheduled topics with enough articles
    const unscheduled = topics.filter(
      (t) => !scheduledTopicIds.has(t.id) && t.articleCount >= 1
    );

    // Sort by article count (more articles = more interesting)
    unscheduled.sort((a, b) => b.articleCount - a.articleCount);

    for (const topic of unscheduled) {
      const priority = this.computePriority(topic);

      await this.db.insertContentPlanItem({
        topicId: topic.id,
        status: "draft",
        priority,
      });

      result.newPlanItems++;
      console.log(
        `[scheduler] Added plan item: "${topic.name}" (priority: ${priority}, articles: ${topic.articleCount})`
      );
    }

    const pending = await this.db.getContentPlanByStatus("draft");
    result.totalPending = pending.length;

    console.log(
      `[scheduler] ${result.newPlanItems} new items, ${result.totalPending} total pending`
    );
    return result;
  }

  /** List the current content plan for human review */
  async listPlan(): Promise<ContentPlanItem[]> {
    return this.db.getAllContentPlan();
  }

  /** Approve a content plan item for writing */
  async approve(planId: string, comment?: string): Promise<void> {
    await this.db.updateContentPlanStatus(planId, "approved");
    if (comment) {
      await this.db.setState(`plan_comment:${planId}`, comment);
    }
    console.log(`[scheduler] Approved plan item ${planId}`);
  }

  /** Skip a content plan item */
  async skip(planId: string): Promise<void> {
    await this.db.updateContentPlanStatus(planId, "skipped");
    console.log(`[scheduler] Skipped plan item ${planId}`);
  }

  /** Compute priority score for a topic */
  private computePriority(topic: StoredTopic): number {
    // Priority based on: article count + recency
    const recencyDays = (Date.now() - topic.updatedAt) / (1000 * 60 * 60 * 24);
    const recencyBonus = Math.max(0, 10 - recencyDays); // Higher if recent
    return topic.articleCount * 10 + recencyBonus;
  }
}
