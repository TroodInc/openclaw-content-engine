import { TopicMemoryDB } from "@contentengine/topic-memory-db";
import type { EngineConfig } from "./config.js";
import {
  ArticleExtractorSkill,
  DiscoursePublisherSkill,
  EditorialIntelligenceSkill,
  SemanticUtilsSkill,
  TelegramReaderSkill,
  TopicMemorySkill,
} from "./skills/index.js";

export interface ContentEngineRuntime {
  telegramReader: TelegramReaderSkill;
  articleExtractor: ArticleExtractorSkill;
  semanticUtils: SemanticUtilsSkill;
  topicMemory: TopicMemorySkill;
  editorialIntelligence: EditorialIntelligenceSkill;
  discoursePublisher: DiscoursePublisherSkill;
}

export function createRuntime(config: EngineConfig, db: TopicMemoryDB): ContentEngineRuntime {
  return {
    telegramReader: new TelegramReaderSkill(config.telegram),
    articleExtractor: new ArticleExtractorSkill(config.extractor),
    semanticUtils: new SemanticUtilsSkill(config.embedding),
    topicMemory: new TopicMemorySkill(db),
    editorialIntelligence: new EditorialIntelligenceSkill(
      config.openai.apiKey,
      config.openai.model || "gpt-4o-mini"
    ),
    discoursePublisher: new DiscoursePublisherSkill(config.discourse),
  };
}
