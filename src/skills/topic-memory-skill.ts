import { TopicMemoryDB } from "@openclaw/topic-memory-db";
import type {
  ContentPlanItem,
  DraftArticle,
  PublishedArticle,
  StoredArticle,
  StoredEmbedding,
  StoredPost,
  StoredTopic,
  TopicArticleLink,
} from "@openclaw/topic-memory-db";
import type { OpenClawSkill } from "./skill.js";

export interface TopicMemorySkillInput {
  operation: string;
}

export class TopicMemorySkill implements OpenClawSkill<TopicMemorySkillInput, unknown> {
  readonly name = "topic_memory";
  readonly description = "Persist and retrieve semantic knowledge, plans, drafts, and publication state.";

  constructor(private readonly db: TopicMemoryDB) {}

  async run(): Promise<unknown> {
    return null;
  }

  async hasPost(telegramId: number, channelId: string): Promise<boolean> {
    return this.db.hasPost(telegramId, channelId);
  }

  async insertPost(post: Omit<StoredPost, "id" | "processedAt">): Promise<StoredPost | null> {
    return this.db.insertPost(post);
  }

  async getPostByTelegramId(telegramId: number, channelId: string): Promise<StoredPost | null> {
    return this.db.getPostByTelegramId(telegramId, channelId);
  }

  async hasArticle(url: string): Promise<boolean> {
    return this.db.hasArticle(url);
  }

  async insertArticle(article: Omit<StoredArticle, "id" | "processedAt">): Promise<StoredArticle | null> {
    return this.db.insertArticle(article);
  }

  async getArticleById(id: string): Promise<StoredArticle | null> {
    return this.db.getArticleById(id);
  }

  async getAllArticles(): Promise<StoredArticle[]> {
    return this.db.getAllArticles();
  }

  async getArticlesWithoutEmbeddings(): Promise<StoredArticle[]> {
    return this.db.getArticlesWithoutEmbeddings();
  }

  async insertEmbedding(embedding: Omit<StoredEmbedding, "id" | "createdAt">): Promise<StoredEmbedding> {
    return this.db.insertEmbedding(embedding);
  }

  async getAllEmbeddings(): Promise<StoredEmbedding[]> {
    return this.db.getAllEmbeddings();
  }

  async getEmbeddingByArticleId(articleId: string): Promise<StoredEmbedding | null> {
    return this.db.getEmbeddingByArticleId(articleId);
  }

  async upsertTopic(topic: Omit<StoredTopic, "createdAt" | "updatedAt">): Promise<StoredTopic> {
    return this.db.upsertTopic(topic);
  }

  async getAllTopics(): Promise<StoredTopic[]> {
    return this.db.getAllTopics();
  }

  async linkArticleToTopic(link: TopicArticleLink): Promise<void> {
    await this.db.linkArticleToTopic(link);
  }

  async getTopicArticleIds(topicId: string): Promise<string[]> {
    return this.db.getTopicArticleIds(topicId);
  }

  async insertContentPlanItem(
    item: Omit<ContentPlanItem, "id" | "createdAt" | "updatedAt">
  ): Promise<ContentPlanItem> {
    return this.db.insertContentPlanItem(item);
  }

  async updateContentPlanStatus(id: string, status: ContentPlanItem["status"]): Promise<void> {
    await this.db.updateContentPlanStatus(id, status);
  }

  async updateContentPlanItem(
    id: string,
    updates: Partial<Pick<ContentPlanItem, "status" | "priority" | "humanComment" | "scheduledDate">>
  ): Promise<void> {
    await this.db.updateContentPlanItem(id, updates);
  }

  async getContentPlanByStatus(status: ContentPlanItem["status"]): Promise<ContentPlanItem[]> {
    return this.db.getContentPlanByStatus(status);
  }

  async getAllContentPlan(): Promise<ContentPlanItem[]> {
    return this.db.getAllContentPlan();
  }

  async insertDraftArticle(
    article: Omit<DraftArticle, "id" | "createdAt" | "updatedAt">
  ): Promise<DraftArticle> {
    return this.db.insertDraftArticle(article);
  }

  async getDraftArticleByContentPlanId(contentPlanId: string): Promise<DraftArticle | null> {
    return this.db.getDraftArticleByContentPlanId(contentPlanId);
  }

  async getDraftArticlesByStatus(status: DraftArticle["status"]): Promise<DraftArticle[]> {
    return this.db.getDraftArticlesByStatus(status);
  }

  async updateDraftArticleStatus(id: string, status: DraftArticle["status"]): Promise<void> {
    await this.db.updateDraftArticleStatus(id, status);
  }

  async insertPublishedArticle(
    article: Omit<PublishedArticle, "id" | "publishedAt">
  ): Promise<PublishedArticle> {
    return this.db.insertPublishedArticle(article);
  }

  async getPublishedArticles(): Promise<PublishedArticle[]> {
    return this.db.getPublishedArticles();
  }

  async getState(key: string): Promise<string | null> {
    return this.db.getState(key);
  }

  async setState(key: string, value: string): Promise<void> {
    await this.db.setState(key, value);
  }
}
