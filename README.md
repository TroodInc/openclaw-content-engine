# Telegram → Discourse Content Engine (OpenClaw)

An OpenClaw-style AI content engine that turns Telegram channel content into drafted and published Discourse articles.

This repository demonstrates a clean separation between:

- **Claws** — lightweight workflow orchestrators
- **Skills** — reusable operations that can be used independently of this project

The system is incremental by design: it processes only new Telegram posts, stores extracted knowledge in PostgreSQL with pgvector, schedules future writing tasks, generates AI drafts, and publishes ready drafts.

---

## Core Architecture

```text
openclaw-content-engine/
  src/
    claws/
      telegram-analyzer-claw.ts
      publication-scheduler-claw.ts
      article-writer-claw.ts
      article-publisher-claw.ts
    skills/
      telegram-reader-skill.ts
      article-extractor-skill.ts
      semantic-utils-skill.ts
      topic-memory-skill.ts
      editorial-intelligence-skill.ts
      discourse-publisher-skill.ts
    runtime.ts
    index.ts
```

## Claws vs Skills

### Claws

Claws are orchestration units. They coordinate multi-step workflows, persist progress, and decide which skills to call next.

Implemented claws:

- `TelegramAnalyzerClaw`
- `PublicationSchedulerClaw`
- `ArticleWriterClaw`
- `ArticlePublisherClaw`

### Skills

Skills are reusable operations. They wrap support packages and expose clean project-facing interfaces.

Implemented skills:

- `TelegramReaderSkill` → wraps `@openclaw/telegram-channel-reader`
- `ArticleExtractorSkill` → wraps `@openclaw/article-extractor`
- `SemanticUtilsSkill` → wraps `@openclaw/semantic-skills`
- `TopicMemorySkill` → wraps `@openclaw/topic-memory-db`
- `DiscoursePublisherSkill` → wraps `@openclaw/discourse-api-client`
- `EditorialIntelligenceSkill` → OpenAI-backed planning and writing skill

---

## End-to-End Pipeline

```text
Telegram channel
  ↓
TelegramAnalyzerClaw
  ↓
Posts + extracted articles + embeddings + topic links
  ↓
PublicationSchedulerClaw
  ↓
Content plan items
  ↓
ArticleWriterClaw
  ↓
Persisted draft articles
  ↓
ArticlePublisherClaw
  ↓
Published Discourse topics
```

### 1. `TelegramAnalyzerClaw`

Responsibilities:

- read new channel posts using `telegram-channel-reader`
- detect URLs
- extract article content using `article-extractor`
- generate embeddings via semantic utilities
- cluster related content into topics
- store structured knowledge in `topic-memory-db`

Output:

- stored posts
- stored articles
- stored embeddings
- topic/article links
- structured article knowledge objects

### 2. `PublicationSchedulerClaw`

Responsibilities:

- review stored articles and topics
- detect which topics are already covered
- cluster similar material for editorial prioritization
- use the editorial AI skill to rank candidate topics
- create content plan entries with optional human comments

Output:

- scheduled article tasks in `content_plan`

### 3. `ArticleWriterClaw`

Responsibilities:

- take an approved scheduled topic
- retrieve related source articles and summaries
- incorporate human comments
- generate a concise article and tags using the editorial AI skill
- persist drafts in `draft_articles`
- update plan item status

Output:

- stored article drafts ready for publication review

### 4. `ArticlePublisherClaw`

Responsibilities:

- retrieve ready drafts
- format and publish them to Discourse
- persist publication metadata
- mark draft and plan statuses as published

Output:

- published Discourse topics
- updated pipeline state

---

## Supporting Repositories Used as Skills

| Package | Purpose |
|---------|---------|
| `telegram-channel-reader` | Incremental Telegram post retrieval |
| `article-extractor` | URL → clean article extraction |
| `semantic-skills` | Embeddings, cosine similarity, clustering |
| `topic-memory-db` | PostgreSQL + pgvector knowledge store |
| `discourse-api-client` | Discourse publishing |

These repositories remain reusable libraries. The OpenClaw binding lives in this repo’s `skills/` layer.

---

## Persistent Data Model

Long-lived editorial memory is stored in PostgreSQL.

| Table | Purpose |
|-------|---------|
| `posts` | Telegram messages with URLs and metadata |
| `articles` | Extracted article content, titles, summaries |
| `embeddings` | `vector(1536)` embeddings with IVFFlat index |
| `topics` | Discovered topic clusters with centroid vectors |
| `topic_articles` | Many-to-many links between topics and articles |
| `content_plan` | Editorial plan items |
| `draft_articles` | AI-generated article drafts persisted before publishing |
| `published_articles` | Published Discourse topic/post references |
| `pipeline_state` | Key-value store for incremental processing state |

Key properties:

- native `vector(1536)` embeddings
- pgvector cosine search support
- incremental last-processed Telegram state
- durable AI draft persistence

---

## Execution Model

Typical loop:

1. `TelegramAnalyzerClaw` processes new posts
2. `PublicationSchedulerClaw` updates the content plan
3. `ArticleWriterClaw` generates drafts for approved tasks
4. `ArticlePublisherClaw` publishes ready drafts

CLI commands:

```bash
node dist/index.js analyze
node dist/index.js schedule
node dist/index.js write
node dist/index.js publish
node dist/index.js run
```

---

## Setup

### Requirements

- **Node.js** ≥ 18
- **PostgreSQL** ≥ 15 with the [pgvector](https://github.com/pgvector/pgvector) extension
- **Telegram API credentials** from [my.telegram.org](https://my.telegram.org)
- **OpenAI API key**
- optional **Discourse API credentials**

### Install

```bash
for dir in telegram-channel-reader article-extractor semantic-skills topic-memory-db discourse-api-client openclaw-content-engine; do
  (cd $dir && npm install)
done

for dir in telegram-channel-reader article-extractor semantic-skills topic-memory-db discourse-api-client openclaw-content-engine; do
  (cd $dir && npm run build)
done
```

### Database

```bash
createdb openclaw
psql openclaw -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### Environment

See [`.env.example`](.env.example) for the full list:

- `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_CHANNEL` — Telegram access
- `OPENAI_API_KEY` — embeddings, scheduling, and article generation
- `DATABASE_URL` — PostgreSQL connection string
- `DISCOURSE_URL`, `DISCOURSE_API_KEY`, `DISCOURSE_USERNAME` — Discourse publishing

---

## Design Principles

- **Claws stay lightweight**
- **Skills remain reusable**
- **AI is used for planning and writing, not just deterministic routing**
- **Incremental operation is mandatory**
- **Persistent semantic memory prevents wasteful reprocessing**
- **Open-source readability matters**

---

## Status

This repository now serves as a cleaner reference structure for an OpenClaw-powered AI content engine built on reusable TypeScript support packages.
