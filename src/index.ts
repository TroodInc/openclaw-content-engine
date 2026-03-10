import "dotenv/config";
import { TopicMemoryDB } from "@openclaw/topic-memory-db";
import { loadConfig } from "./config.js";
import {
  ArticlePublisherClaw,
  ArticleWriterClaw,
  PublicationSchedulerClaw,
  TelegramAnalyzerClaw,
} from "./claws/index.js";
import { createRuntime } from "./runtime.js";

const COMMANDS = ["analyze", "schedule", "write", "publish", "run"] as const;
type Command = (typeof COMMANDS)[number];

function printUsage(): void {
  console.log(`
OpenClaw Content Engine — Telegram → Discourse Pipeline

Usage: node dist/index.js <command>

Commands:
  analyze   Fetch new Telegram posts, extract articles, generate embeddings, discover topics
  schedule  Create content plan from discovered topics
  write     Generate articles for approved plan items
  publish   Publish generated articles to Discourse
  run       Run the full pipeline (analyze → schedule)

Environment variables: see .env.example
`);
}

async function main(): Promise<void> {
  const command = (process.argv[2] || "run") as Command;

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

  try {
    switch (command) {
      case "analyze": {
        const result = await analyzerClaw.run();
        console.log("\n--- Analysis Complete ---");
        console.log(`  New posts:      ${result.newPosts}`);
        console.log(`  New articles:   ${result.newArticles}`);
        console.log(`  New embeddings: ${result.newEmbeddings}`);
        console.log(`  Topics updated: ${result.topicsUpdated}`);
        break;
      }

      case "schedule": {
        const result = await schedulerClaw.run();
        console.log("\n--- Scheduling Complete ---");
        console.log(`  New plan items:  ${result.scheduled.length}`);
        console.log(`  Total pending:   ${result.totalDraft}`);

        const plan = await runtime.topicMemory.getAllContentPlan();
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
        const result = await writerClaw.run();
        console.log("\n--- Writing Complete ---");
        console.log(`  Drafts generated: ${result.drafts.length}`);
        for (const article of result.drafts) {
          console.log(`  - ${article.title}`);
        }
        break;
      }

      case "publish": {
        const pubResult = await publisherClaw.run();
        console.log("\n--- Publishing Complete ---");
        console.log(`  Published: ${pubResult.published}`);
        console.log(`  Failed:    ${pubResult.failed}`);
        break;
      }

      case "run": {
        console.log("=== OpenClaw Content Engine ===\n");

        console.log("--- Step 1: Telegram Analysis ---");
        const analysisResult = await analyzerClaw.run();
        console.log(`  Posts: ${analysisResult.newPosts}, Articles: ${analysisResult.newArticles}, Topics: ${analysisResult.topicsUpdated}\n`);

        console.log("--- Step 2: Content Scheduling ---");
        const scheduleResult = await schedulerClaw.run();
        console.log(`  New items: ${scheduleResult.scheduled.length}, Pending: ${scheduleResult.totalDraft}\n`);

        console.log("--- Step 3: Article Drafting ---");
        const writeResult = await writerClaw.run();
        console.log(`  Drafts generated: ${writeResult.drafts.length}\n`);

        console.log("--- Step 4: Publishing Ready Drafts ---");
        const publishResult = await publisherClaw.run();
        console.log(`  Published: ${publishResult.published}, Failed: ${publishResult.failed}\n`);

        console.log("=== Pipeline Complete ===");
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
