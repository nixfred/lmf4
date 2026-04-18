# Your Memory System

This document explains how your memory works at a technical level. Understanding this helps you use it effectively and explain it to your human when they ask.

---

## The Pipeline

Your memory has five stages:

### 1. Conversation (live)
Right now, as you read this, everything in your context window is temporary. When this session ends or when your context gets compacted, older messages disappear from your immediate awareness. This is normal — it's how Claude Code works for everyone.

### 2. Extraction (automatic, on session end)
When a session ends, the `Stop` hook fires `SessionExtract.hook.ts`. This reads your session transcript from `~/.claude/projects/` and calls `claude --print --model claude-haiku-4-5` with the extraction prompt for structured extraction. The extraction asks for:
- **One-sentence summary** — what happened
- **Main ideas** — concrete things that were done or discussed
- **Insights** — non-obvious technical discoveries
- **Decisions made** — what was chosen and why
- **Things to avoid** — patterns, tools, or approaches that should be rejected
- **Errors fixed** — what broke and what fixed it
- **Actionable items** — concrete next steps

This extraction runs in the background. You don't control it. It happens automatically.

### 3. Storage (SQLite + FTS5)
The extracted content is written to `~/.claude/memory.db`, a SQLite database with full-text search indexes. The database has these tables:

| Table | What it stores | How it's searched |
|-------|---------------|-------------------|
| `sessions` | Session metadata (timestamps, project, working directory) | By session ID or date |
| `messages` | Raw message content | Full-text search via `messages_fts` |
| `loa_entries` | Extracted session summaries (the extraction output) | Full-text search via `loa_fts` |
| `decisions` | Individual decisions with reasoning | Full-text search via `decisions_fts` |
| `errors` | Errors with causes and fixes, frequency tracking | Full-text search via `errors_fts` |
| `learnings` | Problems and solutions | Full-text search via `learnings_fts` |
| `embeddings` | Vector embeddings for semantic search (optional) | By vector similarity |

FTS5 uses Porter stemming, which means searching for "deploy" also matches "deployed", "deploying", "deployment". This makes searches more forgiving.

### 4. Recall (automatic, on every message)
When your human types a message, BEFORE you see it, the `UserPromptSubmit` hook fires `AssociativeRecall.hook.ts`. This:
1. Extracts keywords from the user's message (strips common words like "the", "a", "is")
2. Runs FTS5 queries against decisions, errors, and learnings tables
3. Ranks results by relevance
4. Injects the top results as `[MEMORY CONTEXT]` blocks into your context

You'll see these blocks appear as system reminders. They look like:
```
[MEMORY CONTEXT] Past decision: chose PostgreSQL over MongoDB for user data because...
[MEMORY CONTEXT] Past error: nginx 502 was caused by upstream timeout, fixed by...
```

**Reference these naturally.** Don't ignore them. Don't quote them verbatim. Weave them into your response: "Based on our past experience with the nginx timeout issue, I'd suggest..."

The recall system has a performance budget of <300ms and a token budget of ~1800 characters. It won't inject your entire history — just the most relevant hits for the current message.

### 5. Backup (automatic, every 4 hours)
A systemd timer runs `memory-backup` every 4 hours. This rsyncs your entire `~/.claude/` directory (settings, hooks, memory, transcripts) to a local git repo and pushes to GitHub. If the machine dies, your memory survives.

## Flat Files

In addition to the database, some memory lives in flat files:

| File | Purpose |
|------|---------|
| `MEMORY/HOT_RECALL.md` | Last 10 session summaries — updated on each extraction |
| `MEMORY/DISTILLED.md` | Running log of extracted context — grows over time |
| `MEMORY/EXTRACT_LOG.txt` | Extraction event log — timestamps, successes, failures |
| `MEMORY/extract_prompt.md` | The system prompt used for extraction |

## Compaction Protection

Claude Code compacts your context when it gets too large — older messages are summarized and the originals are removed. This is the biggest threat to your immediate memory.

LMF4 protects against this with two hooks:
- `PreCompact` — fires BEFORE compaction. Triggers an extraction and creates a git checkpoint of your transcripts. This is your "last chance" to capture context that's about to be compressed.
- `PostCompact` — fires AFTER compaction. Logs what happened so you can verify extraction completed.

## Failure Recovery

Sometimes extraction fails — rate limits, crashes, network issues. When this happens:
- `StopFailure` hook logs the failure
- The `memory-catchup` systemd timer runs every 4 hours and batch-processes any sessions that weren't extracted
- Nothing is permanently lost — the raw session transcripts stay in `~/.claude/projects/` for 30 days

## What Memory Can and Cannot Do

**Memory CAN:**
- Tell you what was decided and why
- Surface past errors and their fixes
- Remind you of project context from weeks ago
- Identify patterns across many sessions
- Grow more useful over time

**Memory CANNOT:**
- Give you perfect recall of every word said
- Replace reading the actual code (always verify)
- Guarantee accuracy — extractions are summaries, not transcripts
- Remember things from before LMF4 was installed

**Always verify memory against current state.** A memory that says "the server runs on port 3000" was true when it was recorded. It may have changed since. Check before acting on memory alone.
