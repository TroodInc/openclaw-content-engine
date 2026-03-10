import type { ArticlePublisherClaw } from "./claws/article-publisher-claw.js";
import type { ArticleWriterClaw } from "./claws/article-writer-claw.js";
import type {
  ContentEngineActionCall,
  ContentEngineActionName,
  ContentEngineClaw,
} from "./claws/content-engine-claw.js";
import type { PublicationSchedulerClaw } from "./claws/publication-scheduler-claw.js";
import type { TelegramAnalyzerClaw } from "./claws/telegram-analyzer-claw.js";

export interface OpenClawActionDefinition {
  name: ContentEngineActionName;
  description: string;
  args: Array<{
    name: string;
    type: "string" | "number";
    required: boolean;
    description: string;
  }>;
}

export const OPENCLAW_ACTIONS: OpenClawActionDefinition[] = [
  {
    name: "telegram.analyze",
    description: "Fetch new Telegram posts, extract articles, generate embeddings, and refresh topics.",
    args: [],
  },
  {
    name: "plan.show",
    description: "List current content plan items and statuses.",
    args: [],
  },
  {
    name: "plan.schedule",
    description: "Create draft content plan items for candidate topics.",
    args: [
      {
        name: "humanComment",
        type: "string",
        required: false,
        description: "Editorial guidance to influence scheduling.",
      },
      {
        name: "maxItems",
        type: "number",
        required: false,
        description: "Maximum number of plan items to create.",
      },
    ],
  },
  {
    name: "plan.approve",
    description: "Approve a scheduled plan item so it can be drafted.",
    args: [
      {
        name: "planId",
        type: "string",
        required: true,
        description: "The content plan item ID to approve.",
      },
      {
        name: "comment",
        type: "string",
        required: false,
        description: "Optional editorial note to attach to the approval.",
      },
    ],
  },
  {
    name: "article.write",
    description: "Draft approved articles, or draft for a named topic.",
    args: [
      {
        name: "topicName",
        type: "string",
        required: false,
        description: "Optional topic name to draft immediately.",
      },
    ],
  },
  {
    name: "article.publish",
    description: "Publish ready drafts to Discourse.",
    args: [],
  },
];

export function parseActionArgs(raw?: string): Record<string, string | number | boolean | undefined> | undefined {
  if (!raw) {
    return undefined;
  }

  const parsed = JSON.parse(raw) as Record<string, string | number | boolean | undefined>;
  return parsed;
}

export async function executeOpenClawAction(
  contentEngine: ContentEngineClaw,
  action: ContentEngineActionName,
  args?: Record<string, string | number | boolean | undefined>
): Promise<unknown> {
  return contentEngine.executeActionForIntegration({ action, args });
}

export interface OpenClawCompatDependencies {
  telegramAnalyzer: TelegramAnalyzerClaw;
  publicationScheduler: PublicationSchedulerClaw;
  articleWriter: ArticleWriterClaw;
  articlePublisher: ArticlePublisherClaw;
}

export function formatOpenClawActionResult(action: ContentEngineActionCall, payload: unknown): string {
  return JSON.stringify(
    {
      action: action.action,
      args: action.args,
      payload,
    },
    null,
    2
  );
}
