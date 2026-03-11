import OpenAI from "openai";
import { TopicMemoryDB } from "@contentengine/topic-memory-db";
import type { StoredTopic, ContentPlanItem } from "@contentengine/topic-memory-db";
import type { EngineConfig } from "../config.js";

/** A generated article ready for publishing */
export interface GeneratedArticle {
  planItemId: string;
  title: string;
  body: string;
  tags: string[];
  topicName: string;
}

/** Result of the writing pipeline */
export interface WriteResult {
  articlesGenerated: number;
  articles: GeneratedArticle[];
}

/**
 * Article Writer pipeline.
 *
 * Takes approved content plan items, gathers source article
 * summaries, and generates short insight articles using an LLM.
 */
export class ArticleWriter {
  private db: TopicMemoryDB;
  private config: EngineConfig;
  private openai: OpenAI;

  constructor(config: EngineConfig, db: TopicMemoryDB) {
    this.config = config;
    this.db = db;
    this.openai = new OpenAI({ apiKey: config.openai.apiKey });
  }

  /** Generate articles for all approved plan items */
  async run(): Promise<WriteResult> {
    const approved = await this.db.getContentPlanByStatus("approved");
    const result: WriteResult = { articlesGenerated: 0, articles: [] };

    if (approved.length === 0) {
      console.log("[writer] No approved items to write");
      return result;
    }

    for (const item of approved) {
      console.log(`[writer] Generating article for plan item ${item.id}...`);
      const article = await this.generateArticle(item);
      if (article) {
        result.articles.push(article);
        result.articlesGenerated++;
        await this.db.updateContentPlanStatus(item.id, "writing");
      }
    }

    console.log(`[writer] Generated ${result.articlesGenerated} articles`);
    return result;
  }

  /** Generate a single article from a plan item */
  private async generateArticle(
    item: ContentPlanItem
  ): Promise<GeneratedArticle | null> {
    const topics = await this.db.getAllTopics();
    const topic = topics.find((t: StoredTopic) => t.id === item.topicId);
    if (!topic) return null;

    const sourceMaterial = await this.gatherSourceMaterial(item.topicId);
    const humanComment = (await this.db.getState(`plan_comment:${item.id}`)) || "";

    const prompt = this.buildPrompt(topic, sourceMaterial, humanComment);

    try {
      const response = await this.openai.chat.completions.create({
        model: this.config.openai.model || "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert technical writer. Write concise, insightful articles that summarize and comment on recent developments in a topic area. Output valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
        max_tokens: 2000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      const parsed = JSON.parse(content) as {
        title: string;
        body: string;
        tags: string[];
      };

      return {
        planItemId: item.id,
        title: parsed.title,
        body: parsed.body,
        tags: parsed.tags || [],
        topicName: topic.name,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[writer] Failed to generate article: ${msg}`);
      return null;
    }
  }

  /** Gather summaries of source articles for a topic */
  private async gatherSourceMaterial(topicId: string): Promise<string> {
    const articleIds = await this.db.getTopicArticleIds(topicId);
    const parts: string[] = [];

    for (const articleId of articleIds.slice(0, 5)) {
      const article = await this.db.getArticleById(articleId);
      if (!article) continue;

      const summary = article.summary || article.content.slice(0, 500);
      parts.push(`### ${article.title}\nSource: ${article.url}\n${summary}`);
    }

    return parts.join("\n\n---\n\n") || "No source material available.";
  }

  /** Build the LLM prompt */
  private buildPrompt(
    topic: StoredTopic,
    sourceMaterial: string,
    humanComment: string
  ): string {
    let prompt = `Write a short insight article about the topic: "${topic.name}"

Topic description: ${topic.description}
Number of related articles: ${topic.articleCount}

Source material:
${sourceMaterial}
`;

    if (humanComment) {
      prompt += `\nHuman editorial comment: ${humanComment}\n`;
    }

    prompt += `
Please respond with a JSON object containing:
- "title": A compelling article title
- "body": The article body in Markdown format (300-600 words)
- "tags": An array of 2-5 relevant tags

The article should:
1. Summarize the key developments
2. Provide insightful commentary
3. Be concise and well-structured
`;

    return prompt;
  }
}
