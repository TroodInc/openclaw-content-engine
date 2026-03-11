import OpenAI from "openai";
import type { ContentPlanItem, StoredArticle, StoredTopic } from "@contentengine/topic-memory-db";
import type { ContentEngineSkill } from "./skill.js";

export interface EditorialScheduleCandidate {
  topic: StoredTopic;
  articleTitles: string[];
  alreadyCovered: boolean;
}

export interface ScheduleTopicsInput {
  candidates: EditorialScheduleCandidate[];
  maxItems: number;
  humanComment?: string;
}

export interface ScheduleDecision {
  topicId: string;
  priority: number;
  scheduledDate?: number;
  rationale: string;
}

export interface DraftArticleInput {
  planItem: ContentPlanItem;
  topic: StoredTopic;
  sourceArticles: StoredArticle[];
  humanComment?: string;
}

export interface DraftArticleOutput {
  title: string;
  body: string;
  tags: string[];
  rationale: string;
  readiness: "draft" | "ready";
}

export class EditorialIntelligenceSkill
  implements ContentEngineSkill<ScheduleTopicsInput, ScheduleDecision[]>
{
  readonly name = "editorial_intelligence";
  readonly description = "Use an LLM to prioritize topics and generate concise insight articles.";

  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async run(input: ScheduleTopicsInput): Promise<ScheduleDecision[]> {
    if (input.candidates.length === 0) return [];

    const prompt = JSON.stringify({
      task: "Rank content topics for an AI editorial pipeline.",
      maxItems: input.maxItems,
      humanComment: input.humanComment || null,
      candidates: input.candidates.map((candidate) => ({
        topicId: candidate.topic.id,
        name: candidate.topic.name,
        description: candidate.topic.description,
        articleCount: candidate.topic.articleCount,
        updatedAt: candidate.topic.updatedAt,
        alreadyCovered: candidate.alreadyCovered,
        articleTitles: candidate.articleTitles,
      })),
      output: {
        decisions: [
          {
            topicId: "string",
            priority: 0,
            scheduledDate: 0,
            rationale: "string",
          },
        ],
      },
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You prioritize editorial topics for a content engine. Prefer timely, high-signal, not-yet-covered themes. Return valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return [];

    const parsed = JSON.parse(content) as { decisions?: ScheduleDecision[] };
    return (parsed.decisions || []).slice(0, input.maxItems);
  }

  async writeDraft(input: DraftArticleInput): Promise<DraftArticleOutput> {
    const prompt = JSON.stringify({
      task: "Write a concise insight article in Markdown.",
      topic: {
        id: input.topic.id,
        name: input.topic.name,
        description: input.topic.description,
        articleCount: input.topic.articleCount,
      },
      planItem: {
        id: input.planItem.id,
        priority: input.planItem.priority,
        humanComment: input.humanComment || input.planItem.humanComment || null,
      },
      sources: input.sourceArticles.map((article) => ({
        id: article.id,
        title: article.title,
        url: article.url,
        summary: article.summary || article.content.slice(0, 1000),
      })),
      output: {
        title: "string",
        body: "markdown string",
        tags: ["string"],
        rationale: "string",
        readiness: "ready",
      },
    });

    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an expert technical editor writing short, insightful, source-grounded articles for a content engine. Output valid JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Editorial model returned an empty response");
    }

    const parsed = JSON.parse(content) as DraftArticleOutput;
    return {
      title: parsed.title,
      body: parsed.body,
      tags: parsed.tags || [],
      rationale: parsed.rationale,
      readiness: parsed.readiness === "draft" ? "draft" : "ready",
    };
  }
}
