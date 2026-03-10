import { ArticleExtractor } from "@openclaw/article-extractor";
import type { ExtractedArticle } from "@openclaw/article-extractor";
import type { OpenClawSkill } from "./skill.js";

export interface ExtractArticleInput {
  url: string;
}

export class ArticleExtractorSkill
  implements OpenClawSkill<ExtractArticleInput, ExtractedArticle | null>
{
  readonly name = "article_extractor";
  readonly description = "Extract clean article text from a URL.";

  private readonly extractor: ArticleExtractor;

  constructor() {
    this.extractor = new ArticleExtractor({ timeout: 15_000 });
  }

  async run(input: ExtractArticleInput): Promise<ExtractedArticle | null> {
    return this.extractor.extract(input.url);
  }
}
