# The Library — Your AI's Canonical Memory

## The Problem With Auto-Extracted Memory

LMF4 extracts every session into a searchable database. When your AI starts a new session and you type a message, that database is queried, and relevant past context gets injected. This works great most of the time.

But it has one weakness: **relevance is not certainty**. If your AI ignored a correction three times and you fixed it each time, those corrections _are_ in the database — but whether they surface on any given prompt depends on keyword matching and semantic similarity to what you just typed. A critical rule your AI keeps breaking might not win today's relevance lottery.

## The Solution — Promote It

The Library (`~/.claude/LIBRARY/`) is a third tier of memory: a small set of markdown files you personally decide your AI must never forget. They get loaded at session start, every session, no relevance ranking involved.

Think of it as your AI's law. Volume is the library; canonical is the bylaws.

## When to Promote

Promote a memory when:

- Your AI has violated the same rule three or more times.
- A hard-won architectural decision must never be re-litigated.
- An identity fact about you is critical (your handle, your timezone, your key projects).
- A term, brand, or convention your AI keeps getting wrong.
- Anything you'd want a _brand new_ AI instance to know on day one.

Don't promote every nice-to-have insight. The Library should stay small — probably under 30 entries. If it bloats, signal-to-noise drops and you've recreated the original problem.

## How to Promote

Write a short markdown file with what your AI needs to know. Then:

```bash
bash ~/lmf4/library/bin/promote.sh path/to/your-memo.md
```

(Adjust `~/lmf4` to wherever you cloned the LMF4 repo.)

This copies the file to `~/.claude/LIBRARY/_canonical/` and appends an index entry to `~/.claude/LIBRARY/MEMORY.md`. Your CLAUDE.md should reference `~/.claude/LIBRARY/MEMORY.md` so the index loads at session start.

## Example Files

**`feedback_no_em_dashes.md`** — rule the AI keeps violating:

```markdown
# No em-dashes or en-dashes in copy

When writing blog posts, emails, or any user-facing prose, use commas,
parens, or periods — never em-dashes (—) or en-dashes (–).
```

**`decision_postgres_not_mysql.md`** — architectural decision:

```markdown
# Database choice: Postgres, not MySQL

For all new projects in this codebase, Postgres. Decided after MySQL
replication pain in June. Don't re-litigate unless the reason Postgres
was chosen has materially changed.
```

**`user_github_handle.md`** — identity fact:

```markdown
# GitHub identity

- Username: yourhandle
- Email for commits: you@example.com
- SSH remotes only (never HTTPS)
```

## When NOT to Promote

- One-off project context → that's what auto-memory is for.
- Things that change weekly → canonical is for stability, not news.
- Things the AI actually does remember reliably → don't fix what isn't broken.

## Inspection

Your AI's Library lives in two places:

- `~/.claude/LIBRARY/_canonical/` — the markdown files
- `~/.claude/LIBRARY/MEMORY.md` — the index (auto-updated by promote.sh)

You can hand-edit the index if a summary is off. You can delete a file from `_canonical/` to demote it (remove the corresponding line in `MEMORY.md` too).
