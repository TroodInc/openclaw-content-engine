import OpenAI from "openai";
import type { ContentPlanItem } from "@openclaw/topic-memory-db";
import type { ArticlePublisherClaw } from "./article-publisher-claw.js";
import type { ArticleWriterClaw } from "./article-writer-claw.js";
import type { PublicationSchedulerClaw } from "./publication-scheduler-claw.js";
import type { TelegramAnalyzerClaw } from "./telegram-analyzer-claw.js";

export type ContentEngineActionName =
  | "telegram.analyze"
  | "plan.show"
  | "plan.schedule"
  | "plan.approve"
  | "article.write"
  | "article.publish";

export interface ContentEngineActionCall {
  action: ContentEngineActionName;
  args?: Record<string, string | number | boolean | undefined>;
}

export interface ChatResponse {
  action: ContentEngineActionName;
  summary: string;
  payload: unknown;
}

export interface ContentEngineClawDependencies {
  telegramAnalyzer: TelegramAnalyzerClaw;
  publicationScheduler: PublicationSchedulerClaw;
  articleWriter: ArticleWriterClaw;
  articlePublisher: ArticlePublisherClaw;
  openAiApiKey: string;
  model?: string;
}

export class ContentEngineClaw {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(private readonly deps: ContentEngineClawDependencies) {
    this.client = new OpenAI({ apiKey: deps.openAiApiKey });
    this.model = deps.model || "gpt-4o-mini";
  }

  async handleUserMessage(message: string): Promise<ChatResponse> {
    const actionCall = await this.decideAction(message);
    return this.executeAction(actionCall);
  }

  async runConvenienceSequence(): Promise<ChatResponse[]> {
    const commands = [
      "Analyze new Telegram posts",
      "Schedule high priority content plan items",
      "Write articles for approved or requested topics",
      "Publish scheduled articles",
    ];

    const responses: ChatResponse[] = [];
    for (const command of commands) {
      responses.push(await this.handleUserMessage(command));
    }
    return responses;
  }

  private async decideAction(message: string): Promise<ContentEngineActionCall> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You route chat requests for an OpenClaw content engine. Choose exactly one action and JSON args. Valid actions: telegram.analyze, plan.show, plan.schedule, plan.approve, article.write, article.publish. Return JSON only with shape { action, args }. For article.write, include topicName when the user mentions a topic. For plan.approve include planId and optional comment. For plan.schedule include humanComment and optional maxItems.",
        },
        { role: "user", content: message },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return this.fallbackAction(message);
    }

    try {
      const parsed = JSON.parse(content) as ContentEngineActionCall;
      return parsed.action ? parsed : this.fallbackAction(message);
    } catch {
      return this.fallbackAction(message);
    }
  }

  private fallbackAction(message: string): ContentEngineActionCall {
    const normalized = message.toLowerCase();

    if (normalized.includes("analyz") || normalized.includes("telegram")) {
      return { action: "telegram.analyze" };
    }
    if (normalized.includes("show") && normalized.includes("plan")) {
      return { action: "plan.show" };
    }
    if (normalized.includes("schedule") || normalized.includes("plan")) {
      return { action: "plan.schedule" };
    }
    if (normalized.includes("publish")) {
      return { action: "article.publish" };
    }
    if (normalized.includes("write") || normalized.includes("article")) {
      const aboutMatch = normalized.match(/about\s+(.+)$/);
      return {
        action: "article.write",
        args: aboutMatch ? { topicName: aboutMatch[1] } : undefined,
      };
    }

    return { action: "plan.show" };
  }

  private async executeAction(call: ContentEngineActionCall): Promise<ChatResponse> {
    switch (call.action) {
      case "telegram.analyze": {
        const payload = await this.deps.telegramAnalyzer.analyze();
        return {
          action: call.action,
          summary: `Analyzed Telegram updates: ${payload.newPosts} new posts, ${payload.newArticles} new articles, ${payload.topicsUpdated} topics updated.`,
          payload,
        };
      }

      case "plan.show": {
        const plan = await this.deps.publicationScheduler.showPlan();
        return {
          action: call.action,
          summary: this.formatPlanSummary(plan),
          payload: plan,
        };
      }

      case "plan.schedule": {
        const payload = await this.deps.publicationScheduler.schedule({
          humanComment: this.readStringArg(call.args, "humanComment"),
          maxItems: this.readNumberArg(call.args, "maxItems"),
        });
        return {
          action: call.action,
          summary: `Scheduled ${payload.scheduled.length} plan items. Total draft items: ${payload.totalDraft}.`,
          payload,
        };
      }

      case "plan.approve": {
        const planId = this.readRequiredStringArg(call.args, "planId");
        const comment = this.readStringArg(call.args, "comment");
        await this.deps.publicationScheduler.approve(planId, comment);
        return {
          action: call.action,
          summary: `Approved content plan item ${planId}.`,
          payload: { planId, comment },
        };
      }

      case "article.write": {
        const topicName = this.readStringArg(call.args, "topicName");
        const payload = topicName
          ? await this.deps.articleWriter.writeAbout(topicName)
          : await this.deps.articleWriter.write();
        return {
          action: call.action,
          summary: `Generated ${payload.drafts.length} draft articles${topicName ? ` for topic \"${topicName}\"` : ""}.`,
          payload,
        };
      }

      case "article.publish": {
        const payload = await this.deps.articlePublisher.publish();
        return {
          action: call.action,
          summary: `Published ${payload.published} drafts with ${payload.failed} failures.`,
          payload,
        };
      }
    }
  }

  private formatPlanSummary(plan: ContentPlanItem[]): string {
    if (plan.length === 0) {
      return "The content plan is currently empty.";
    }

    const counts = plan.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    const fragments = Object.entries(counts).map(([status, count]) => `${status}: ${count}`);
    return `Current content plan contains ${plan.length} items (${fragments.join(", ")}).`;
  }

  private readStringArg(
    args: ContentEngineActionCall["args"],
    key: string
  ): string | undefined {
    const value = args?.[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readRequiredStringArg(
    args: ContentEngineActionCall["args"],
    key: string
  ): string {
    const value = this.readStringArg(args, key);
    if (!value) {
      throw new Error(`Missing required argument: ${key}`);
    }
    return value;
  }

  private readNumberArg(
    args: ContentEngineActionCall["args"],
    key: string
  ): number | undefined {
    const value = args?.[key];
    return typeof value === "number" ? value : undefined;
  }
}
