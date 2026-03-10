# Telegram → Discourse Content Engine (OpenClaw)

An AI-powered editorial pipeline that converts curated Telegram content into structured articles published on Discourse. Further to be extended for multiple platforms.

The system analyzes posts from a Telegram channel, extracts article content, identifies topics, builds an editorial plan, and automatically publishes high-quality summaries or commentary to a Discourse forum.

Goal:
Create a semi-autonomous content machine requiring minimal human input.

---

## Architecture

The system is built using OpenClaw agents ("Claws") and modular skills.

### Claws

Telegram Analyzer
- monitors Telegram channel
- extracts articles
- generates summaries
- updates topic memory

Publication Scheduler
- analyzes topic trends
- builds editorial calendar
- allows user review/edit

Article Writer
- generates Discourse articles from topics and article summaries
- incorporates user comments

Article Publisher
- publishes articles to Discourse
- tracks publication state

---

## Skills used

telegram-channel-reader  
article-extractor  
embedding-utils  
topic-memory-db  
discourse-api-client

---

## Data model

The system maintains:

posts  
articles  
embeddings  
topics  
topic_article_relations  
content_plan  
published_articles

---

## Workflow

Telegram Channel
↓
Telegram Analyzer
↓
Article extraction + summarization
↓
Topic memory update
↓
Editorial plan generation
↓
Article generation
↓
Discourse publishing

---

## Goal

Efficient token usage through incremental topic memory and embeddings.

Only new content is processed during updates.

---

## Status

Early experimental OpenClaw project.
