import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { ContentEngineClaw } from "./claws/content-engine-claw.js";

export async function startInteractiveChat(contentEngine: ContentEngineClaw): Promise<void> {
  const rl = readline.createInterface({ input, output });

  console.log("OpenClaw Content Engine Chat");
  console.log("Type your request, or 'exit' to quit.\n");

  try {
    while (true) {
      const message = (await rl.question("> ")).trim();
      if (!message) continue;
      if (message === "exit" || message === "quit") break;

      const response = await contentEngine.handleUserMessage(message);
      console.log(`\n[action] ${response.action}`);
      console.log(`[summary] ${response.summary}\n`);
    }
  } finally {
    rl.close();
  }
}
