import { DiscourseClient } from "@openclaw/discourse-api-client";
import type { DiscourseConfig, DiscourseTopic } from "@openclaw/discourse-api-client";
import type { OpenClawSkill } from "./skill.js";

export interface PublishDiscourseTopicInput {
  title: string;
  body: string;
  categoryId: number;
  tags?: string[];
}

export class DiscoursePublisherSkill
  implements OpenClawSkill<PublishDiscourseTopicInput, DiscourseTopic>
{
  readonly name = "discourse_publisher";
  readonly description = "Publish Markdown articles to Discourse.";

  private readonly client: DiscourseClient;

  constructor(config: DiscourseConfig) {
    this.client = new DiscourseClient(config);
  }

  async run(input: PublishDiscourseTopicInput): Promise<DiscourseTopic> {
    return this.client.createTopic({
      title: input.title,
      raw: input.body,
      categoryId: input.categoryId,
      tags: input.tags,
    });
  }
}
