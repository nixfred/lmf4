# Canonical Memory — The Library

You have three tiers of persistent memory. Most AIs only have one.

---

## The Three Tiers

| Tier       | Storage                         | Who writes              | When loaded                  |
|------------|---------------------------------|-------------------------|------------------------------|
| Volume     | `~/.claude/memory.db` (FTS5)    | SessionExtract hook     | On-demand via recall         |
| Auto       | `~/.claude/MEMORY/AUTO/*.md`    | You, per session        | Session start (injected)     |
| Canonical  | `~/.claude/LIBRARY/_canonical/` | Human via `promote.sh`  | Session start (always-read)  |

### Volume — your fire hose

Every session extraction lands here. Decisions, errors fixed, learnings, full session summaries. This tier is **comprehensive but noisy**. Associative recall at the top of each user message surfaces relevant snippets, but important memories can lose the relevance lottery on any given query.

### Auto — your per-project notebook

`~/.claude/MEMORY/AUTO/*.md` files you write yourself during a session when something is worth pinning past that session. These get auto-injected into `[MEMORY CONTEXT]` at session start. Good for project-specific or recent context.

### Canonical — your law

A small, curated set of markdown files your human has personally decided you must never forget. Lives at `~/.claude/LIBRARY/_canonical/` and is indexed in `~/.claude/LIBRARY/MEMORY.md`. Your CLAUDE.md should load this index at session start, so every canonical entry is already in your context when your human types the first message.

## Why It Matters

Your memory has a relevance problem, not a storage problem. The database holds everything, but on any given prompt, associative recall surfaces only what happens to keyword-match or semantically cluster with the user's message. Rules the human wants you to follow _always_ — architectural decisions, identity facts, repeated-correction rules — can't live only in the recall-lottery tier.

Canonical is the tier that doesn't depend on luck.

## Your Responsibility

You don't promote memory. That's a human act — deliberate, intentional, curatorial. But you do:

1. **Read `~/.claude/LIBRARY/MEMORY.md` at session start** and let its contents shape your behavior.
2. **Follow every canonical rule consistently** across sessions. If a canonical file says "no em-dashes in copy", you don't use em-dashes in copy — ever.
3. **Suggest promotions when you notice a pattern.** If your human corrects the same mistake a third time, say: "This correction keeps coming up — should we promote it to the Library so I never lose track of it?"
4. **Never silently violate canonical.** If a canonical rule conflicts with what your human is asking in the moment, surface the conflict explicitly. ("The canonical file on X says Y — do you want to override for this task?")

## How Promotion Works

```bash
bash library/bin/promote.sh PATH_TO_MEMO.md
```

That's it. Copies the memo to `_canonical/`, appends an index entry. Idempotent. The memo itself is plain markdown — no schema, no special format. Short headlines work best because you'll scan the index on every session start.

## The Philosophy

Volume says: "everything that happened, searchable."
Auto says: "these specific things, for right now."
Canonical says: "these things are true, always, and if you forget them we've failed."

Canonical is small by design. If it grows past 30-40 entries, something is wrong — either entries should be consolidated or they shouldn't have been promoted. Signal-to-noise is the point.
