import { randomUUID } from "node:crypto";
import type { StoredArticle, StoredTopic } from "@openclaw/topic-memory-db";
import type { TelegramPost } from "@openclaw/telegram-channel-reader";
import type { Cluster } from "@openclaw/semantic-skills";
import type { OpenClawRuntime } from "../runtime.js";

export interface ArticleKnowledgeObject {
  article: StoredArticle;
  topicIds: string[];
}

export interface TelegramAnalyzerClawResult {
  newPosts: number;
  newArticles: number;
  newEmbeddings: number;
  topicsUpdated: number;
  knowledgeObjects: ArticleKnowledgeObject[];
}

export class TelegramAnalyzerClaw {
  constructor(
    private readonly runtime: OpenClawRuntime,
    private readonly channelKey: string
  ) {}

  async run(): Promise<TelegramAnalyzerClawResult> {
    return this.analyze();
  }

  async analyze(): Promise<TelegramAnalyzerClawResult> {
    const lastId = await this.getLastProcessedId();
    const fetchResult = await this.runtime.telegramReader.run({ sinceId: lastId, limit: 100 });
    const newPosts = await this.persistNewPosts(fetchResult.posts);
    const extractedArticles = await this.extractArticles(newPosts);
    const newEmbeddings = await this.embedNewArticles();
    const topicAssignments = await this.refreshTopics();

    if (fetchResult.session) {
      await this.runtime.topicMemory.setState("telegram_session", fetchResult.session);
    }
    if (fetchResult.lastId > lastId) {
      await this.runtime.topicMemory.setState(
        this.lastTelegramIdKey(),
        String(fetchResult.lastId)
      );
    }

    return {
      newPosts: newPosts.length,
      newArticles: extractedArticles.length,
      newEmbeddings,
      topicsUpdated: new Set(topicAssignments.flatMap((item) => item.topicIds)).size,
      knowledgeObjects: topicAssignments,
    };
  }

  async close(): Promise<void> {
    await this.runtime.telegramReader.disconnect();
  }

  private async getLastProcessedId(): Promise<number> {
    const raw = await this.runtime.topicMemory.getState(this.lastTelegramIdKey());
    return raw ? parseInt(raw, 10) : 0;
  }

  private lastTelegramIdKey(): string {
    return `last_telegram_id:${this.channelKey}`;
  }

  private async persistNewPosts(posts: TelegramPost[]): Promise<TelegramPost[]> {
    const inserted: TelegramPost[] = [];
    for (const post of posts) {
      if (await this.runtime.topicMemory.hasPost(post.id, post.channelId)) continue;
      const stored = await this.runtime.topicMemory.insertPost({
        telegramId: post.id,
        channelId: post.channelId,
        text: post.text,
        urls: post.urls,
        date: post.date,
      });
      if (stored) inserted.push(post);
    }
    return inserted;
  }

  private async extractArticles(posts: TelegramPost[]): Promise<StoredArticle[]> {
    const created: StoredArticle[] = [];
    for (const post of posts) {
      if (post.urls.length === 0) continue;
      const storedPost = await this.runtime.topicMemory.getPostByTelegramId(post.id, post.channelId);
      if (!storedPost) continue;

      for (const url of post.urls) {
        if (await this.runtime.topicMemory.hasArticle(url)) continue;
        const extracted = await this.runtime.articleExtractor.run({ url });
        if (!extracted) continue;

        const stored = await this.runtime.topicMemory.insertArticle({
          postId: storedPost.id,
          url: extracted.url,
          title: extracted.title,
          content: extracted.content,
          summary: extracted.description,
          wordCount: extracted.wordCount,
        });
        if (stored) created.push(stored);
      }
    }
    return created;
  }

  private async embedNewArticles(): Promise<number> {
    const articles = await this.runtime.topicMemory.getArticlesWithoutEmbeddings();
    if (articles.length === 0) return 0;
    const texts = articles.map((article) => `${article.title}\n\n${article.content.slice(0, 2500)}`);
    const embeddings = await this.runtime.semanticUtils.run({ texts });
    for (let index = 0; index < embeddings.length; index++) {
      await this.runtime.topicMemory.insertEmbedding({
        articleId: articles[index].id,
        embedding: embeddings[index].embedding,
        model: embeddings[index].model,
      });
    }
    return embeddings.length;
  }

  private async refreshTopics(): Promise<ArticleKnowledgeObject[]> {
    const embeddings = await this.runtime.topicMemory.getAllEmbeddings();
    if (embeddings.length === 0) return [];

    const clusters = this.runtime.semanticUtils.cluster({
      embeddings: embeddings.map((embedding) => embedding.embedding),
      threshold: 0.72,
    });

    const existingTopics = await this.runtime.topicMemory.getAllTopics();
    const clusterTopics = new Map<number, StoredTopic>();

    for (const cluster of clusters) {
      const topic = await this.persistTopicCluster(cluster, embeddings, existingTopics);
      clusterTopics.set(cluster.id, topic);
    }

    const assignments = new Map<string, Set<string>>();
    for (const cluster of clusters) {
      const topic = clusterTopics.get(cluster.id);
      if (!topic) continue;
      for (const memberIndex of cluster.members) {
        const embedding = embeddings[memberIndex];
        const similarity = this.runtime.semanticUtils.similarity(
          embedding.embedding,
          cluster.centroid
        );
        await this.runtime.topicMemory.linkArticleToTopic({
          topicId: topic.id,
          articleId: embedding.articleId,
          similarity,
        });
        const articleTopicIds = assignments.get(embedding.articleId) || new Set<string>();
        articleTopicIds.add(topic.id);
        assignments.set(embedding.articleId, articleTopicIds);
      }
    }

    const articles = await this.runtime.topicMemory.getAllArticles();
    return articles
      .filter((article) => assignments.has(article.id))
      .map((article) => ({
        article,
        topicIds: Array.from(assignments.get(article.id) || []),
      }));
  }

  private async persistTopicCluster(
    cluster: Cluster,
    embeddings: Awaited<ReturnType<OpenClawRuntime["topicMemory"]["getAllEmbeddings"]>>,
    existingTopics: StoredTopic[]
  ): Promise<StoredTopic> {
    const matched = existingTopics.find((topic) => {
      const similarity = this.runtime.semanticUtils.similarity(
        topic.centroidEmbedding,
        cluster.centroid
      );
      return similarity > 0.85;
    });

    return this.runtime.topicMemory.upsertTopic({
      id: matched?.id || randomUUID(),
      name: matched?.name || `Topic ${cluster.id + 1}`,
      description: matched?.description || "AI-discovered topic cluster",
      centroidEmbedding: cluster.centroid,
      articleCount: cluster.members.length,
    });
  }
}
