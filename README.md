# Telegram → Discourse Content Engine

A Telegram → Discourse content engine built as a chat-first claws-and-skills system, with both Dockerized execution and an OpenClaw-compatible control surface.

The repository supports two complementary usage modes in the same codebase:

- **Dockerized runtime mode** — run the content engine and database in containers
- **OpenClaw-compatible mode** — let an external OpenClaw installation drive this repo through stable machine-friendly actions

This repository demonstrates a clean separation between:

- **Claws** — lightweight workflow orchestrators
- **Skills** — reusable operations that can be used independently of this project

The system is incremental by design: it processes only new Telegram posts, stores extracted knowledge in PostgreSQL with pgvector, schedules future writing tasks, generates AI drafts, and publishes ready drafts.

## Fastest Launch

From the workspace root:

```bash
chmod +x ./content-engine.sh
cp openclaw-content-engine/.env.docker.example openclaw-content-engine/.env.docker
./content-engine.sh docker setup
./content-engine.sh docker chat
```

The root `content-engine.sh` script is the recommended entrypoint.
For open-source usage, the simplest path is the Docker-first flow above.
If you want to run everything directly on your machine instead, use the local commands further below.

---

## Docker Setup

The workspace includes a containerized runtime for isolated execution:

- `Dockerfile` — builds the multi-repo Node.js workspace
- `docker-compose.yml` — runs the content engine and PostgreSQL with `pgvector`
- `.env.docker.example` — example container environment file

```bash
./content-engine.sh docker db
./content-engine.sh docker analyze
./content-engine.sh docker schedule
./content-engine.sh docker write
./content-engine.sh docker publish
./content-engine.sh docker action plan.show
./content-engine.sh docker stop
./content-engine.sh docker reset
```

What they do:

- `docker setup` — build the image and start the database
- `docker chat` — launch the chat interface
- `docker db` — start only the database
- `docker stop` — stop the Docker stack
- `docker reset` — stop the stack and delete the Docker database volume

---

## OpenClaw-Compatible Mode

This repo exposes a stable action interface intended for an external OpenClaw controller.

Compatibility assets:

- `prompt.md` — domain prompt for the content engine agent
- `openclaw/actions.json` — machine-readable action catalog
- `node dist/index.js action ...` — stable action execution CLI

Example host usage:

```bash
node dist/index.js action plan.show
node dist/index.js action plan.schedule '{"humanComment":"Prioritize security and infra topics","maxItems":3}'
node dist/index.js action article.write '{"topicName":"AI agent economy"}'
```

Example Docker usage:

```bash
docker compose run --rm engine node dist/index.js action plan.show
docker compose run --rm engine node dist/index.js action article.publish
```

This gives you one repo with two operating styles:

- **self-contained Docker execution**
- **external OpenClaw-driven execution**

---

## Core Architecture

```text
openclaw-content-engine/
  src/
    claws/
      content-engine-claw.ts
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

- `ContentEngineClaw`
- `TelegramAnalyzerClaw`
- `PublicationSchedulerClaw`
- `ArticleWriterClaw`
- `ArticlePublisherClaw`

### Skills

Skills are reusable operations. They wrap workspace support packages and expose clean project-facing interfaces.

Implemented skills:

- `TelegramReaderSkill` → wraps the workspace package `@openclaw/telegram-channel-reader`
- `ArticleExtractorSkill` → wraps the workspace package `@openclaw/article-extractor`
- `SemanticUtilsSkill` → wraps the workspace package `@openclaw/semantic-skills`
- `TopicMemorySkill` → wraps the workspace package `@openclaw/topic-memory-db`
- `DiscoursePublisherSkill` → wraps the workspace package `@openclaw/discourse-api-client`
- `EditorialIntelligenceSkill` → provides OpenAI-backed planning and writing

The `@openclaw/*` package scope here is this workspace's internal package namespace.
It is not meant to imply that these packages come from an official OpenClaw SDK.

---

## Chat-First Control Flow

```text
OpenClaw Chat Interface
  ↓
ContentEngineClaw
  ↓
Specialized claw actions
  ├─ TelegramAnalyzerClaw.analyze()
  ├─ PublicationSchedulerClaw.showPlan()
  ├─ PublicationSchedulerClaw.schedule()
  ├─ ArticleWriterClaw.write()
  ├─ ArticleWriterClaw.writeAbout()
  └─ ArticlePublisherClaw.publish()
```

The user interacts with the content engine through chat.
`ContentEngineClaw` is the primary control mechanism and decides which specialized claw action to call.

For machine-driven integrations, the same action surface is also available through `node dist/index.js action <name> '<json-args>'`.

Example interactions:

- `Analyze new Telegram posts`
- `Show the current content plan`
- `Write an article about the AI agent economy`
- `Publish scheduled articles`

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

These repositories remain reusable workspace libraries. The OpenClaw-compatible binding lives in this repo’s `skills/` layer and CLI action surface.

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

Primary interface:

- `./content-engine.sh docker chat`

Additional machine-friendly interface:

- `node dist/index.js action <action-name> '<json-args>'`

Convenience commands:

- `./content-engine.sh docker analyze`
- `./content-engine.sh docker schedule`
- `./content-engine.sh docker write`
- `./content-engine.sh docker publish`
- `./content-engine.sh docker run`
- `./content-engine.sh analyze`
- `./content-engine.sh schedule`
- `./content-engine.sh write`
- `./content-engine.sh publish`
- `./content-engine.sh run`

`run` may still be used, but it is only a convenience wrapper that triggers a sequence of chat-routed claw actions through `ContentEngineClaw`.

Example convenience sequence:

1. `TelegramAnalyzerClaw` processes new posts
2. `PublicationSchedulerClaw` updates the content plan
3. `ArticleWriterClaw` generates drafts for approved tasks
4. `ArticlePublisherClaw` publishes ready drafts

CLI commands:

```bash
./content-engine.sh docker chat
./content-engine.sh docker analyze
./content-engine.sh docker schedule
./content-engine.sh docker write
./content-engine.sh docker publish
./content-engine.sh docker run
./content-engine.sh analyze
./content-engine.sh schedule
./content-engine.sh write
./content-engine.sh publish
./content-engine.sh run
```

You can still invoke the orchestrator directly with `node dist/index.js ...`, but the root launcher is the recommended entrypoint for this multi-repo workspace.

---

## Setup

### Requirements

- **Node.js** ≥ 18
- **PostgreSQL** ≥ 15 with the [pgvector](https://github.com/pgvector/pgvector) extension
- **Telegram API credentials** from [my.telegram.org](https://my.telegram.org)
- **OpenAI API key**
- optional **Discourse API credentials**

### Install

Recommended host setup:

```bash
./content-engine.sh setup
```

If you do not want to install dependencies on your host, use the Docker workflow documented above instead.

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

For `./content-engine.sh chat`, `analyze`, `schedule`, or `write`, only the Telegram/OpenAI/DB values are required.
For `./content-engine.sh publish` or `run`, publish credentials are required.

---

## Design Principles

- **Claws stay lightweight**
- **The chat agent is the primary control interface**
- **Skills remain reusable**
- **AI is used for planning and writing, not just deterministic routing**
- **Incremental operation is mandatory**
- **Persistent semantic memory prevents wasteful reprocessing**
- **Open-source readability matters**

## Integration Status

What is implemented today:

- a chat-first control layer via `ContentEngineClaw`
- specialized claws for analysis, scheduling, writing, and publishing
- reusable workspace packages under the `@openclaw/*` scope
- Dockerized isolated execution for the app and database
- an OpenClaw-compatible action entrypoint for external control

What this means in practice:

- you can run the system directly through Docker or the local launcher
- you can let an external OpenClaw setup drive this repo through `node dist/index.js action ...`
- the compatibility surface is explicit and machine-friendly

What is not implemented yet:

- a verified official OpenClaw SDK dependency in this codebase
- official OpenClaw runtime registration or packaging conventions from `docs.openclaw.ai`

---

## Status

This repository now serves as a dual-mode content engine: self-hosted through Docker or the local launcher, and externally controllable through an OpenClaw-compatible action interface.
