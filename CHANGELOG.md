# Changelog

All notable changes to LMF4 (the persistent-memory system for Claude Code).

## [4.1.0] — 2026-04-18

The "standalone" release. LMF4.1 no longer requires PAI, Fabric, Go, or any local LLM. It's a single-repo install for persistent memory in Claude Code, and nothing else.

### Breaking changes

- **PAI is no longer required.** The old install path that cloned `danielmiessler/Personal_AI_Infrastructure` and ran its `install.sh` is gone. LMF4.1 lives in one repo.
- **Fabric is no longer required.** The `FabricExtract.hook.ts` hook is renamed to `SessionExtract.hook.ts` and calls `claude --print --model claude-haiku-4-5` directly (using your Claude Code subscription — no API key, no Go, no Fabric binary, no `go install github.com/danielmiessler/fabric@latest`).
- **Inference.ts is removed.** The hook previously depended on a wrapper tool at `~/.claude/tools/Inference.ts` (or the PAI path). LMF4.1 calls the Claude CLI directly; the wrapper is no longer needed.
- **`import-telos.ts` command is removed.** It was hardcoded to a personal identity-document format and doesn't belong in a public teaching repo. The underlying `telos` table in `memory.db` is preserved for forward compatibility, but no CLI command reads from a specific file layout. Use `mem add decision` / `mem add learning` for purpose-framework entries.

### Migration from LMF4.0 (existing users)

If you're on LMF4.0 with PAI + Fabric, you have three options:

1. **Stay on 4.0.** Nothing forces the upgrade. The 4.0 hook will keep working as long as Fabric and its configured model are reachable.
2. **Upgrade to 4.1, keep PAI.** They coexist. Just re-run `./install` from a fresh clone of LMF4.1 — it additively wires the renamed `SessionExtract` hook, leaves your PAI bits alone, and the old `FabricExtract` reference in `settings.json` can be deleted by hand or ignored.
3. **Full cutover.** Uninstall Fabric (`rm ~/go/bin/fabric ~/.config/fabric/.env`), uninstall Go if you don't need it elsewhere, remove PAI if you want to (`rm -rf ~/.claude/PAI ~/Projects/Personal_AI_Infrastructure`), and re-run LMF4.1's `./install`.

No data migration is required for any path — `memory.db`, backups, and `~/.claude/MEMORY/` are all backward-compatible.

### New features

- **The Library (canonical memory tier).** `library/` ships a `promote.sh` tool and `_canonical/` convention. Promoted memos live at `~/.claude/LIBRARY/_canonical/` with an index at `~/.claude/LIBRARY/MEMORY.md`. Load the index at session start to guarantee always-on rules. See [`docs/for-the-human/06-the-library.md`](docs/for-the-human/06-the-library.md) and [`docs/for-the-ai/10-canonical-memory.md`](docs/for-the-ai/10-canonical-memory.md).
- **`bootstrap/` — multi-host propagation.** `bootstrap/standalone.sh` is the one-liner for a fresh host. `bootstrap/satellite.sh` adds a new machine to an existing AI by cloning its backup repo into `~/.claude`. See [`docs/for-the-human/07-multi-host.md`](docs/for-the-human/07-multi-host.md).
- **`mem catchup` subcommand.** Batch-extracts any unprocessed session transcripts. Wired to the `memory-catchup.timer` systemd unit. Idempotent.
- **`ForeverCommit.hook.sh` (opt-in).** SessionEnd hook that auto-commits `~/.claude` (or `$HOME`) to a private git repo with four safeguards: env gate at install, sentinel file, required `.gitignore` patterns, and an extra guard for committing `$HOME` itself. Ships `templates/forever-commit.gitignore` as a secret-excluding baseline. Read [`docs/for-the-human/08-forever-commit.md`](docs/for-the-human/08-forever-commit.md) before enabling.
- **Full `mem` CLI command suite (ported from LMF3).** `add`, `search`, `recent`, `show`, `stats`, `dump`, `loa`, `embed`, `semantic`, `hybrid`, `init`, `import`, `import-docs`, `import-legacy`, plus the new `catchup`. Modular TypeScript; builds with `bun`; installed at `~/bin/mem` via `./install`.
- **`CONSTITUTION.md` promoted to repo root.** The 8 principles live at `/CONSTITUTION.md` now, making them the first thing a reader (human or AI) sees at the top level. `docs/for-the-ai/04-the-constitution.md` remains as a pointer for old links.
- **`GENESIS.md` template.** A placeholder-laden first-memory template the installer substitutes and promotes into the canonical Library.

### Changed

- `memory-catchup.service` ExecStart wrapper (`~/bin/memory-catchup`) now prefers `mem catchup` if the mem CLI is on PATH; falls back to the SessionExtract hook's `--batch` mode for back-compat.
- `systemd/memory-catchup.timer` OnCalendar is explicitly documented as offset 1h from `memory-backup.timer` (catchup fires at `01/4:00`, backup at `00/4:00`). Prevents the two timers from competing for `claude --print` quota.
- MCP tool description for `memory_search` is no longer user-personalized ("search your persistent memory" vs. the previous personal phrasing). Database and hook behavior unchanged.
- Default Ollama URL for semantic embeddings: `localhost:11434` (was a hardcoded Tailscale IP in LMF3). Override with `OLLAMA_URL` env var. If Ollama isn't running, keyword (FTS5) search still works — semantic search gracefully degrades.
- `loa` and `dump` commands now run extraction via `claude --print --model claude-haiku-4-5` instead of `fabric --pattern extract_wisdom`. Schema unchanged (`fabric_extract` column name preserved for back-compat — the name stopped being accurate but changing it would be a destructive migration).
- Docs genericized across `docs/for-the-ai/` and `docs/post-install/` — no personal names in any shipped file. Origin story keeps the factual lineage (LMF1 → LMF4.1) without attribution.

### Removed

- `docs/post-install/` files preserved but body edited to drop personal attribution.
- `templates/statusline-command.sh` behavior unchanged but documentation updated.
- PAI install step (1c) and Fabric install step (1b) removed from the install checklist.
- `Inference.ts` dependency in the extraction hook.
- `tools/Inference.ts` — no longer referenced; will be removed from the repo in a future commit if no other caller emerges.

### Repo layout additions

```
CONSTITUTION.md              # promoted to top-level
GENESIS.md                   # placeholder-template for first memory
CHANGELOG.md                 # this file
library/                     # canonical memory promotion
  README.md
  bin/promote.sh
  _canonical/.gitkeep
bootstrap/                   # install helpers
  standalone.sh
  satellite.sh
hooks/ForeverCommit.hook.sh  # opt-in auto-commit hook
templates/forever-commit.gitignore
docs/for-the-human/06-the-library.md
docs/for-the-human/07-multi-host.md
docs/for-the-human/08-forever-commit.md
docs/for-the-ai/10-canonical-memory.md
mem-cli/src/commands/        # full LMF3 port (13 commands, -1 telos)
mem-cli/src/db/              # schema + connection
mem-cli/src/lib/             # memory + embeddings + project + import
mem-cli/src/types/
mem-cli/src/version.ts
```

### Renamed

- `hooks/FabricExtract.hook.ts` → `hooks/SessionExtract.hook.ts`

### Security / privacy

- Sanitization sweep before release: git-grep confirms zero personal identifiers, zero hardcoded internal IPs, zero internal hostnames, zero API keys or secrets in tracked files.
- `templates/forever-commit.gitignore` excludes `.env*`, `.ssh/`, `.aws/`, `.gnupg/`, `*.key`, `*.pem`, `**/secret*`, `**/token*`, `**/*credential*` as a baseline. ForeverCommit hook refuses to run without these patterns present in the target repo's `.gitignore`.

---

## [4.0.x] — prior releases

See git log for changes before 4.1. Key milestones:

- **4.0.3**: PAI integration, Fabric + Go + PAI prereqs finalized, statusline installer, system-test v1
- **4.0.2**: MCP server, mem CLI, compaction protection
- **4.0.1**: Initial public release with hooks + extraction pipeline

---

## [3.x] and earlier

LMF3 lived in a separate private repo. Its mem CLI is the basis of the LMF4.1 port. See `mem-cli/src/` for the code lineage.

LMF1 (flat markdown files) and LMF2 (Fabric-categorized files) predate this repo.
