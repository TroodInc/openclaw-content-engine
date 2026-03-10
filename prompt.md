Create an OpenClaw project implementing a Telegram → Discourse content pipeline.

Agents (Claws):

1. Telegram Analyzer
   - read posts from a Telegram channel
   - detect article links
   - extract article content
   - summarize articles
   - generate embeddings
   - update topic memory

2. Publication Scheduler
   - analyze topics
   - build a content plan
   - support user review/edit
   - schedule article generation and publishing

3. Article Writer
   - generate Discourse articles
   - use topic summaries and article summaries
   - incorporate user comments
   - assign tags

4. Article Publisher
   - publish articles to Discourse
   - update publication status

Use modular skills for:

telegram reading  
article extraction  
embeddings  
database storage  
discourse publishing

Design the system for incremental processing and minimal token usage.

Avoid reprocessing the entire Telegram archive.

Use clean modular architecture.