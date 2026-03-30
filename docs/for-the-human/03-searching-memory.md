# Searching Memory

Your AI's memory is fully searchable. Here's how to use it.

---

## Automatic Recall (You Don't Do Anything)

Every time you type a message in a Claude Code session, the memory system automatically searches for relevant context and injects it. Your AI sees this context before responding.

You don't need to say "check your memory" — it happens on every message. But you can be explicit if automatic recall doesn't find what you need.

## Ask Your AI

During a conversation, just ask naturally:

- "Do you remember when we set up Docker on this machine?"
- "What was the error we hit with the SSL certificates?"
- "Have we worked with GraphQL before?"
- "Search your memory for 'Kubernetes ingress'"

Your AI has an MCP tool called `memory_search` that it can invoke to do deep searches across all memory tables.

## Command-Line Search

Outside of a Claude Code session, you can search memory directly:

```bash
# Basic search
mem search "docker compose"

# Search for decisions
mem search "decided to use"

# Search for errors
mem search "timeout error"

# Search for a specific project
mem search "authentication API"
```

The search uses FTS5 full-text search with Porter stemming. This means:
- "deploy" matches "deployed", "deploying", "deployment"
- "run" matches "running", "runs", "ran"
- You can use quotes for exact phrases: `mem search '"nginx proxy"'`

## What's Searchable

| Category | What it contains | Example search |
|----------|-----------------|---------------|
| Sessions | Summaries of every conversation | `mem search "refactored the database"` |
| Decisions | Technical decisions with reasoning | `mem search "PostgreSQL"` |
| Errors | Bugs encountered and their fixes | `mem search "502 bad gateway"` |
| Learnings | Problems and solutions | `mem search "rate limiting"` |

## Quick Memory Check

To see what your AI remembers from recent sessions:

```bash
# Last 10 session summaries
cat ~/.claude/MEMORY/HOT_RECALL.md

# Last few entries in the distilled memory
tail -50 ~/.claude/MEMORY/DISTILLED.md
```

## Advanced: Direct Database Queries

If you know SQL, you can query the memory database directly:

```bash
# Open the database (read-only is safest)
sqlite3 ~/.claude/memory.db

# See all tables
.tables

# Recent decisions
SELECT created_at, decision, reasoning FROM decisions ORDER BY created_at DESC LIMIT 10;

# Errors with fixes
SELECT error, fix, frequency FROM errors ORDER BY frequency DESC LIMIT 10;

# Full-text search
SELECT * FROM decisions_fts WHERE decisions_fts MATCH 'kubernetes' LIMIT 5;

# Exit
.quit
```

Note: If `sqlite3` isn't installed, you can use bun:
```bash
bun -e "const db=new(require('bun:sqlite').Database)(process.env.HOME+'/.claude/memory.db',{readonly:true}); console.table(db.prepare('SELECT created_at, decision FROM decisions ORDER BY created_at DESC LIMIT 10').all())"
```
