import "dotenv/config";
import { TopicMemoryDB } from "@openclaw/topic-memory-db";
import { loadConfig } from "./config.js";
import {
  ArticlePublisherClaw,
  ArticleWriterClaw,
  ContentEngineClaw,
  PublicationSchedulerClaw,
  TelegramAnalyzerClaw,
} from "./claws/index.js";
import { startInteractiveChat } from "./chat.js";
import {
  executeOpenClawAction,
  OPENCLAW_ACTIONS,
  parseActionArgs,
} from "./openclaw-compat.js";
import { createRuntime } from "./runtime.js";

const COMMANDS = ["chat", "action", "analyze", "schedule", "write", "publish", "run"] as const;
type Command = (typeof COMMANDS)[number];

function printUsage(): void {
  console.log(`
OpenClaw Content Engine — Telegram → Discourse Pipeline

Usage: node dist/index.js <command>

Commands:
  chat      Start an interactive OpenClaw chat session
  action    Execute a machine-friendly action for OpenClaw-compatible integrations
  analyze   Fetch new Telegram posts, extract articles, generate embeddings, discover topics
  schedule  Create content plan from discovered topics
  write     Generate articles for approved plan items
  publish   Publish generated articles to Discourse
  run       Convenience wrapper that triggers chat-routed claw actions

Environment variables: see .env.example
`);
}

async function main(): Promise<void> {
  const command = (process.argv[2] || "chat") as Command;

  if (!COMMANDS.includes(command)) {
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  const config = loadConfig();

  const db = new TopicMemoryDB(config.db.connectionString);
  await db.init();
  const runtime = createRuntime(config, db);
  const analyzerClaw = new TelegramAnalyzerClaw(runtime, config.telegram.channel);
  const schedulerClaw = new PublicationSchedulerClaw(runtime);
  const writerClaw = new ArticleWriterClaw(runtime);
  const publisherClaw = new ArticlePublisherClaw(runtime, config.discourse.categoryId);
  const contentEngineClaw = new ContentEngineClaw({
    telegramAnalyzer: analyzerClaw,
    publicationScheduler: schedulerClaw,
    articleWriter: writerClaw,
    articlePublisher: publisherClaw,
    openAiApiKey: config.openai.apiKey,
    model: config.openai.model,
  });

  try {
    switch (command) {
      case "chat": {
        await startInteractiveChat(contentEngineClaw);
        break;
      }

      case "action": {
        const actionName = process.argv[3];
        const actionDefinition = OPENCLAW_ACTIONS.find((action) => action.name === actionName);
        if (!actionName || !actionDefinition) {
          console.error("Unknown or missing action name.");
          console.error(`Available actions: ${OPENCLAW_ACTIONS.map((action) => action.name).join(", ")}`);
          process.exit(1);
        }

        const args = parseActionArgs(process.argv[4]);
        const payload = await executeOpenClawAction(contentEngineClaw, actionDefinition.name, args);
        console.log(
          JSON.stringify(
            {
              action: actionDefinition.name,
              args: args || {},
              payload,
            },
            null,
            2
          )
        );
        break;
      }

      case "analyze": {
        const response = await contentEngineClaw.handleUserMessage("Analyze new Telegram posts");
        const result = response.payload as Awaited<ReturnType<TelegramAnalyzerClaw["analyze"]>>;
        console.log("\n--- Analysis Complete ---");
        console.log(`  New posts:      ${result.newPosts}`);
        console.log(`  New articles:   ${result.newArticles}`);
        console.log(`  New embeddings: ${result.newEmbeddings}`);
        console.log(`  Topics updated: ${result.topicsUpdated}`);
        break;
      }

      case "schedule": {
        const response = await contentEngineClaw.handleUserMessage("Schedule high priority content plan items");
        const result = response.payload as Awaited<ReturnType<PublicationSchedulerClaw["schedule"]>>;
        console.log("\n--- Scheduling Complete ---");
        console.log(`  New plan items:  ${result.scheduled.length}`);
        console.log(`  Total pending:   ${result.totalDraft}`);

        const planResponse = await contentEngineClaw.handleUserMessage("Show the current content plan");
        const plan = planResponse.payload as Awaited<ReturnType<PublicationSchedulerClaw["showPlan"]>>;
        if (plan.length > 0) {
          console.log("\nContent Plan:");
          const topics = await runtime.topicMemory.getAllTopics();
          for (const item of plan) {
            const topic = topics.find((t) => t.id === item.topicId);
            console.log(
              `  [${item.status.toUpperCase()}] ${topic?.name || item.topicId} (priority: ${item.priority})`
            );
          }
        }
        break;
      }

      case "write": {
        const response = await contentEngineClaw.handleUserMessage("Write an article for approved scheduled topics");
        const result = response.payload as Awaited<ReturnType<ArticleWriterClaw["write"]>>;
        console.log("\n--- Writing Complete ---");
        console.log(`  Drafts generated: ${result.drafts.length}`);
        for (const article of result.drafts) {
          console.log(`  - ${article.title}`);
        }
        break;
      }

      case "publish": {
        const response = await contentEngineClaw.handleUserMessage("Publish scheduled articles");
        const pubResult = response.payload as Awaited<ReturnType<ArticlePublisherClaw["publish"]>>;
        console.log("\n--- Publishing Complete ---");
        console.log(`  Published: ${pubResult.published}`);
        console.log(`  Failed:    ${pubResult.failed}`);
        break;
      }

      case "run": {
        console.log("=== OpenClaw Content Engine Chat Convenience Run ===\n");
        const responses = await contentEngineClaw.runConvenienceSequence();
        for (const response of responses) {
          console.log(`[${response.action}] ${response.summary}`);
        }
        console.log("\n=== Convenience Run Complete ===");
        break;
      }
    }
  } finally {
    await analyzerClaw.close();
    await db.close();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
