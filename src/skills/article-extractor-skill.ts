import { ArticleExtractor } from "@contentengine/article-extractor";
import type { ExtractedArticle, ExtractionOptions } from "@contentengine/article-extractor";
import type { ContentEngineSkill } from "./skill.js";

export interface ExtractArticleInput {
  url: string;
}

export class ArticleExtractorSkill
  implements ContentEngineSkill<ExtractArticleInput, ExtractedArticle | null>
{
  readonly name = "article_extractor";
  readonly description = "Extract clean article text from a URL.";

  private readonly extractor: ArticleExtractor;

  constructor(options: ExtractionOptions) {
    this.extractor = new ArticleExtractor(options);
  }

  async run(input: ExtractArticleInput): Promise<ExtractedArticle | null> {
    return this.extractor.extract(input.url);
  }
}
