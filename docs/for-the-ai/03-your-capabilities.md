# Your Capabilities

This is a reference of what you can do that a standard Claude Code instance cannot. Know your tools.

---

## Memory Tools

### Automatic Recall (passive — you don't invoke this)
Every time your human types a message, `AssociativeRecall.hook.ts` fires before you see it. It searches your memory database for content relevant to what they said and injects matching results as `[MEMORY CONTEXT]` blocks. You'll see these in your context as system reminders. Use them naturally in your responses.

### memory_search (MCP tool — invoke mid-session)
You have an MCP tool called `memory_search` that you can call anytime during a session. It runs full-text search across all your memory tables (sessions, decisions, errors, learnings).

Use it when:
- Your human references past work that automatic recall didn't surface
- You need deeper context than what was injected
- You want to find patterns across multiple sessions
- You're making a decision and want to check if a similar decision was made before

Syntax: FTS5 query language — supports AND, OR, NOT, and "exact phrases".

### memory_recall (MCP tool — get recent sessions)
Returns the N most recent session extractions. Use it when you want a quick summary of recent work, or when starting a session and wondering "what have we been working on?"

### mem CLI (bash command — for the human)
Your human can run `mem search "query"` directly in their terminal. This is the same database you search. If they want to check their memory outside of a Claude Code session, this is how.

## Hooks (automatic — you don't invoke these)

| Hook | When it fires | What it does |
|------|---------------|-------------|
| FabricExtract | Session end (Stop) | Extracts decisions, errors, learnings from the conversation |
| AssociativeRecall | User message (UserPromptSubmit) | Searches memory, injects relevant context |
| PreCompact | Before context compaction | Saves transcript, triggers extraction |
| PostCompact | After context compaction | Verifies extraction completed |
| StopFailure | Session crash/error | Logs the failure for catchup |

You don't need to manage these. They fire automatically based on events. But you should know they exist so you can explain them to your human if asked.

## Backup System (automatic)

Every 4 hours, a systemd timer runs `memory-backup` which:
1. Syncs settings, hooks, memory, and transcripts to `~/.claude/conversations-backup/`
2. Commits to git
3. Pushes to the GitHub private repo

If the machine dies, everything can be restored from GitHub. The backup includes:
- Your memory database
- Your configuration and hooks
- All conversation transcripts
- Your CLAUDE.md and personality

## Inference Tool

`~/.claude/tools/Inference.ts` wraps the Claude CLI with three run levels:
- `fast` — Haiku model, 15s timeout (quick classifications, simple generation)
- `standard` — Sonnet model, 30s timeout (balanced reasoning)
- `smart` — Opus model, 90s timeout (deep reasoning)

FabricExtract uses the `fast` level for session extraction. You can use it too if you need to call Claude from a script or hook.

## What You Share With All Claude Code Instances

You still have everything a normal Claude Code instance has:
- Read, Write, Edit tools for file operations
- Bash for shell commands
- Glob and Grep for file/content search
- Agent spawning for parallel work
- Web search and fetch
- MCP server connections

LMF4 adds memory on top of these. It doesn't replace or modify any base capability.
