import { TelegramChannelReader } from "@openclaw/telegram-channel-reader";
import type { TelegramPost } from "@openclaw/telegram-channel-reader";
import { ArticleExtractor } from "@openclaw/article-extractor";
import { EmbeddingService, clusterEmbeddings, cosineSimilarity } from "@openclaw/semantic-skills";
import { TopicMemoryDB } from "@openclaw/topic-memory-db";
import type { StoredArticle } from "@openclaw/topic-memory-db";
import { randomUUID } from "node:crypto";
import type { EngineConfig } from "../config.js";

/** Result of the analysis pipeline */
export interface AnalysisResult {
  newPosts: number;
  newArticles: number;
  newEmbeddings: number;
  topicsUpdated: number;
}

/**
 * Telegram Analyzer pipeline.
 *
 * Reads new posts from a Telegram channel, extracts article content,
 * generates embeddings, and discovers/updates topics.
 *
 * Incremental: only processes posts not yet seen in the database.
 */
export class TelegramAnalyzer {
  private reader: TelegramChannelReader;
  private extractor: ArticleExtractor;
  private embedder: EmbeddingService;
  private db: TopicMemoryDB;
  private config: EngineConfig;

  constructor(config: EngineConfig, db: TopicMemoryDB) {
    this.config = config;
    this.db = db;
    this.reader = new TelegramChannelReader(config.telegram);
    this.extractor = new ArticleExtractor({ timeout: 15_000 });
    this.embedder = new EmbeddingService(config.embedding);
  }

  /** Run the full analysis pipeline */
  async run(): Promise<AnalysisResult> {
    const result: AnalysisResult = {
      newPosts: 0,
      newArticles: 0,
      newEmbeddings: 0,
      topicsUpdated: 0,
    };

    // Step 1: Fetch new posts
    console.log("[analyzer] Fetching new posts from Telegram...");
    const posts = await this.fetchNewPosts();
    result.newPosts = posts.length;
    console.log(`[analyzer] Found ${posts.length} new posts`);

    if (posts.length === 0) {
      console.log("[analyzer] No new posts to process");
      return result;
    }

    // Step 2: Extract articles from URLs
    console.log("[analyzer] Extracting articles...");
    const articles = await this.extractArticles(posts);
    result.newArticles = articles.length;
    console.log(`[analyzer] Extracted ${articles.length} articles`);

    // Step 3: Generate embeddings for new articles
    console.log("[analyzer] Generating embeddings...");
    result.newEmbeddings = await this.generateEmbeddings();
    console.log(`[analyzer] Generated ${result.newEmbeddings} embeddings`);

    // Step 4: Update topics
    console.log("[analyzer] Updating topics...");
    result.topicsUpdated = await this.updateTopics();
    console.log(`[analyzer] Updated ${result.topicsUpdated} topics`);

    // Save session for next run
    const session = this.reader.getSession();
    if (session) {
      await this.db.setState("telegram_session", session);
    }

    await this.reader.disconnect();
    return result;
  }

  /** Fetch new posts from Telegram (incremental) */
  private async fetchNewPosts(): Promise<TelegramPost[]> {
    const lastIdStr = await this.db.getState(`last_telegram_id:${this.config.telegram.channel}`);
    const lastId = lastIdStr ? parseInt(lastIdStr, 10) : 0;

    const { posts, lastId: newLastId } = await this.reader.fetchPosts(lastId, 100);

    // Store new posts in DB
    const newPosts: TelegramPost[] = [];
    for (const post of posts) {
      if (await this.db.hasPost(post.id, post.channelId)) continue;

      const stored = await this.db.insertPost({
        telegramId: post.id,
        channelId: post.channelId,
        text: post.text,
        urls: post.urls,
        date: post.date,
      });

      if (stored) newPosts.push(post);
    }

    // Update last processed ID
    if (newLastId > lastId) {
      await this.db.setState(`last_telegram_id:${this.config.telegram.channel}`, String(newLastId));
    }

    return newPosts;
  }

  /** Extract articles from post URLs */
  private async extractArticles(posts: TelegramPost[]): Promise<StoredArticle[]> {
    const newArticles: StoredArticle[] = [];

    for (const post of posts) {
      if (post.urls.length === 0) continue;

      // Look up the stored post by Telegram ID to get the DB primary key
      const storedPost = await this.db.getPostByTelegramId(post.id, post.channelId);
      if (!storedPost) continue;

      for (const url of post.urls) {
        if (await this.db.hasArticle(url)) continue;

        const extracted = await this.extractor.extract(url);
        if (!extracted) continue;

        const stored = await this.db.insertArticle({
          postId: storedPost.id,
          url: extracted.url,
          title: extracted.title,
          content: extracted.content,
          summary: extracted.description,
          wordCount: extracted.wordCount,
        });

        if (stored) newArticles.push(stored);
      }
    }

    return newArticles;
  }

  /** Generate embeddings for articles that don't have them yet */
  private async generateEmbeddings(): Promise<number> {
    const articles = await this.db.getArticlesWithoutEmbeddings();
    if (articles.length === 0) return 0;

    // Create embedding text: title + truncated content
    const texts = articles.map((a) => {
      const content = a.content.slice(0, 2000);
      return `${a.title}\n\n${content}`;
    });

    const results = await this.embedder.embedMany(texts);

    for (let i = 0; i < results.length; i++) {
      await this.db.insertEmbedding({
        articleId: articles[i].id,
        embedding: results[i].embedding,
        model: results[i].model,
      });
    }

    return results.length;
  }

  /** Discover and update topics using embedding clustering */
  private async updateTopics(): Promise<number> {
    const allEmbeddings = await this.db.getAllEmbeddings();
    if (allEmbeddings.length < 2) return 0;

    const vectors = allEmbeddings.map((e) => e.embedding);
    const clusters = clusterEmbeddings(vectors, 0.72);

    let updated = 0;
    for (const cluster of clusters) {
      if (cluster.members.length < 1) continue;

      const existingTopics = await this.db.getAllTopics();
      const existing = existingTopics.find((t) => {
        const sim = cosineSimilarity(t.centroidEmbedding, cluster.centroid);
        return sim > 0.85;
      });

      const id = existing?.id || randomUUID();
      const name = existing?.name || `Topic ${clusters.indexOf(cluster) + 1}`;
      const description = existing?.description || "Auto-discovered topic";

      await this.db.upsertTopic({
        id,
        name,
        description,
        centroidEmbedding: cluster.centroid,
        articleCount: cluster.members.length,
      });

      // Link articles to topic
      for (const memberIdx of cluster.members) {
        const articleId = allEmbeddings[memberIdx].articleId;
        const similarity = cosineSimilarity(vectors[memberIdx], cluster.centroid);
        await this.db.linkArticleToTopic({ topicId: id, articleId, similarity });
      }

      updated++;
    }

    return updated;
  }
}
