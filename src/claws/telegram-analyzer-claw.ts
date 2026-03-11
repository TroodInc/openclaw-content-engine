import { randomUUID } from "node:crypto";
import type { StoredArticle, StoredTopic } from "@contentengine/topic-memory-db";
import type { TelegramPost } from "@contentengine/telegram-channel-reader";
import type { Cluster } from "@contentengine/semantic-skills";
import type { ContentEngineRuntime } from "../runtime.js";

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

function truncateText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeTitleSeed(title: string): string {
  return title
    .replace(/\s*[\|\-–—:]\s*.*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholderTopicName(name: string | undefined): boolean {
  return !name || /^Topic \d+$/i.test(name.trim());
}

function isPlaceholderTopicDescription(description: string | undefined): boolean {
  const normalized = description?.trim().toLowerCase();
  return !normalized || normalized === "ai-discovered topic cluster" || normalized === "auto-discovered topic";
}

export class TelegramAnalyzerClaw {
  constructor(
    private readonly runtime: ContentEngineRuntime,
    private readonly channelKey: string
  ) {}

  async run(): Promise<TelegramAnalyzerClawResult> {
    return this.analyze();
  }

  async analyze(): Promise<TelegramAnalyzerClawResult> {
    const lastId = await this.getLastProcessedId();
    const fetchResult = await this.runtime.telegramReader.run({ sinceId: lastId });
    const newPosts = await this.persistNewPosts(fetchResult.posts);
    await this.enqueueArticleExtractions(newPosts);
    const extractedArticles = await this.processArticleExtractionQueue();
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

  private async enqueueArticleExtractions(posts: TelegramPost[]): Promise<void> {
    for (const post of posts) {
      if (post.urls.length === 0) continue;
      const storedPost = await this.runtime.topicMemory.getPostByTelegramId(post.id, post.channelId);
      if (!storedPost) continue;

      for (const url of post.urls) {
        if (await this.runtime.topicMemory.hasArticle(url)) continue;
        await this.runtime.topicMemory.enqueueArticleExtractionJob({ url, postId: storedPost.id });
      }
    }
  }

  private async processArticleExtractionQueue(): Promise<StoredArticle[]> {
    const created: StoredArticle[] = [];
    const jobs = await this.runtime.topicMemory.getPendingArticleExtractionJobs(200);

    for (const job of jobs) {
      if (await this.runtime.topicMemory.hasArticle(job.url)) {
        await this.runtime.topicMemory.completeArticleExtractionJob(job.url);
        continue;
      }

      try {
        const extracted = await this.runtime.articleExtractor.run({ url: job.url });
        if (!extracted) {
          await this.runtime.topicMemory.recordArticleExtractionFailure(
            job.url,
            "extractor_returned_null"
          );
          continue;
        }

        const stored = await this.runtime.topicMemory.insertArticle({
          postId: job.postId,
          url: job.url,
          title: extracted.title,
          content: extracted.content,
          summary: extracted.description,
          wordCount: extracted.wordCount,
        });
        await this.runtime.topicMemory.completeArticleExtractionJob(job.url);
        if (stored) created.push(stored);
      } catch (error) {
        const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        await this.runtime.topicMemory.recordArticleExtractionFailure(job.url, message);
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
    const articles = await this.runtime.topicMemory.getAllArticles();

    const clusters = this.runtime.semanticUtils.cluster({
      embeddings: embeddings.map((embedding) => embedding.embedding),
      threshold: 0.72,
    });

    const existingTopics = await this.runtime.topicMemory.getAllTopics();
    const clusterTopics = new Map<number, StoredTopic>();

    for (const cluster of clusters) {
      const topic = await this.persistTopicCluster(cluster, embeddings, articles, existingTopics);
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

    return articles
      .filter((article) => assignments.has(article.id))
      .map((article) => ({
        article,
        topicIds: Array.from(assignments.get(article.id) || []),
      }));
  }

  private async persistTopicCluster(
    cluster: Cluster,
    embeddings: Awaited<ReturnType<ContentEngineRuntime["topicMemory"]["getAllEmbeddings"]>>,
    articles: Awaited<ReturnType<ContentEngineRuntime["topicMemory"]["getAllArticles"]>>,
    existingTopics: StoredTopic[]
  ): Promise<StoredTopic> {
    const matched = existingTopics.find((topic) => {
      const similarity = this.runtime.semanticUtils.similarity(
        topic.centroidEmbedding,
        cluster.centroid
      );
      return similarity > 0.85;
    });

    const topicMetadata = this.describeTopicCluster(cluster, embeddings, articles);

    return this.runtime.topicMemory.upsertTopic({
      id: matched?.id || randomUUID(),
      name: isPlaceholderTopicName(matched?.name) ? topicMetadata.name : (matched?.name as string),
      description: isPlaceholderTopicDescription(matched?.description)
        ? topicMetadata.description
        : (matched?.description as string),
      centroidEmbedding: cluster.centroid,
      articleCount: cluster.members.length,
    });
  }

  private describeTopicCluster(
    cluster: Cluster,
    embeddings: Awaited<ReturnType<ContentEngineRuntime["topicMemory"]["getAllEmbeddings"]>>,
    articles: Awaited<ReturnType<ContentEngineRuntime["topicMemory"]["getAllArticles"]>>
  ): { name: string; description: string } {
    const articleMap = new Map(articles.map((article) => [article.id, article]));
    const clusterArticles = cluster.members
      .map((memberIndex) => {
        const embedding = embeddings[memberIndex];
        const article = articleMap.get(embedding.articleId);
        if (!article) return null;
        const similarity = this.runtime.semanticUtils.similarity(embedding.embedding, cluster.centroid);
        return { article, similarity };
      })
      .filter((item): item is { article: StoredArticle; similarity: number } => item !== null)
      .sort((a, b) => b.similarity - a.similarity);

    const representativeTitles = clusterArticles
      .map((item) => normalizeTitleSeed(item.article.title))
      .filter(Boolean);

    const name = representativeTitles[0]
      ? truncateText(representativeTitles[0], 80)
      : `Topic ${cluster.id + 1}`;

    const descriptionSource = representativeTitles.slice(0, 3);
    const description =
      descriptionSource.length > 0
        ? truncateText(`Sources: ${descriptionSource.join(" | ")}`, 220)
        : "AI-discovered topic cluster";

    return { name, description };
  }
}
