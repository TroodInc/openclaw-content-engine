# OpenClaw-Compatible Mode

This folder defines the stable compatibility surface for driving the content engine from an external OpenClaw installation.

## What this means

This repository is not bundled with an official OpenClaw SDK integration.
Instead, it exposes a machine-friendly action interface that an OpenClaw-controlled agent can invoke.

## Files

- `actions.json` — action catalog and command entrypoints
- `../prompt.md` — high-level agent prompt for the content engine

## Supported invocation patterns

### Host runtime

```bash
node dist/index.js chat
node dist/index.js action plan.show
node dist/index.js action plan.schedule '{"humanComment":"Focus on security topics","maxItems":3}'
```

### Docker runtime

```bash
docker compose run --rm engine node dist/index.js chat
docker compose run --rm engine node dist/index.js action plan.show
docker compose run --rm engine node dist/index.js action article.write '{"topicName":"AI agent economy"}'
```

## Recommended OpenClaw usage

Use OpenClaw as the external control plane and this repository as the execution backend.
The OpenClaw-side agent should:

1. use `prompt.md` as the domain prompt
2. inspect `openclaw/actions.json` for action names and arguments
3. execute `node dist/index.js action ...` or the Docker equivalent
4. consume the JSON result returned by the action command
