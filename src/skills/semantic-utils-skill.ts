import {
  EmbeddingService,
  clusterEmbeddings,
  cosineSimilarity,
} from "@openclaw/semantic-skills";
import type {
  EmbeddingResult,
  EmbeddingServiceConfig,
  Cluster,
} from "@openclaw/semantic-skills";
import type { OpenClawSkill } from "./skill.js";

export interface GenerateEmbeddingsInput {
  texts: string[];
}

export interface SemanticClusteringInput {
  embeddings: number[][];
  threshold?: number;
}

export class SemanticUtilsSkill
  implements OpenClawSkill<GenerateEmbeddingsInput, EmbeddingResult[]>
{
  readonly name = "semantic_utils";
  readonly description = "Generate embeddings and semantic clusters.";

  private readonly embeddingService: EmbeddingService;

  constructor(config: EmbeddingServiceConfig) {
    this.embeddingService = new EmbeddingService(config);
  }

  async run(input: GenerateEmbeddingsInput): Promise<EmbeddingResult[]> {
    return this.embeddingService.embedMany(input.texts);
  }

  async embed(text: string): Promise<EmbeddingResult> {
    return this.embeddingService.embed(text);
  }

  cluster(input: SemanticClusteringInput): Cluster[] {
    return clusterEmbeddings(input.embeddings, input.threshold ?? 0.72);
  }

  similarity(left: number[], right: number[]): number {
    return cosineSimilarity(left, right);
  }
}
