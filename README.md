<div align="center">

# 🧠 LMF4.1

### Persistent memory for Claude Code — your AI actually remembers.

[![Claude Code](https://img.shields.io/badge/Claude_Code-Compatible-blueviolet?style=for-the-badge)](https://claude.ai/code) [![Linux](https://img.shields.io/badge/Linux-Any_distro-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://kernel.org) [![SQLite](https://img.shields.io/badge/SQLite-FTS5-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/fts5.html) [![Bun](https://img.shields.io/badge/Bun-1.0+-f9f1e1?style=for-the-badge&logo=bun&logoColor=black)](https://bun.sh) [![Version](https://img.shields.io/badge/version-4.1-10b981?style=for-the-badge)](CHANGELOG.md) [![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br>

**Every conversation saved. Every decision searchable. Every session builds on the last.**

*Standalone. No PAI. No Fabric. No local LLM required. Just Claude Code and ~20 minutes.*

</div>

---

<table>
<tr>
<td width="50%">

### 🕳️ The Problem

Every Claude Code session starts **blank**.

Your AI forgets:
- The architecture you spent an hour explaining
- The decision you made last Tuesday
- The bug you fixed three sessions ago
- Your coding style, your stack, your tradeoffs

You repeat yourself. Constantly. And when the context window fills, *it forgets what you said this morning*.

</td>
<td width="50%">

### ✨ The Solution

**LMF4 gives your AI real memory.**

- Every session auto-extracted to a searchable database
- Relevant past context auto-injected into every new message
- Three tiers — volume, curated, canonical
- Survives compaction, crashes, machine failure, fresh-installs
- Private, on your machine, backed up to *your* GitHub

Your AI gets smarter every day. You stop repeating yourself. Forever.

</td>
</tr>
</table>

<br>

## 🔄 How memory flows

```mermaid
flowchart LR
    A["🗣️ You type"] --> B["🔍 AssociativeRecall<br/>searches memory.db"]
    B --> C["💬 AI responds<br/>with past context"]
    C --> D["📝 Session<br/>ends or compacts"]
    D --> E["⚙️ SessionExtract<br/>→ claude haiku"]
    E --> F["💾 Structured rows<br/>written to SQLite"]
    F --> A
    style A fill:#3b82f6,color:#fff,stroke:none
    style B fill:#8b5cf6,color:#fff,stroke:none
    style C fill:#3b82f6,color:#fff,stroke:none
    style D fill:#64748b,color:#fff,stroke:none
    style E fill:#f59e0b,color:#fff,stroke:none
    style F fill:#10b981,color:#fff,stroke:none
```

<br>

---

## 🚀 Install

<div align="center">

### One instruction. Your Claude Code does the rest.

</div>

Open Claude Code and paste this:

```
Clone this repo and follow the install instructions in README.md literally:
git clone https://github.com/nixfred/lmf4.git
```

That's it. Your Claude Code will:

1. Detect what you have installed (bun, git, sqlite, claude)
2. Install anything missing — or tell you what only you can do
3. Ask you ~10 questions (your name, your AI's name, personality, GitHub)
4. Build the memory stack (database, hooks, MCP server, systemd timers)
5. Run a **personality workshop** so your AI picks who it is
6. Write its **Genesis Block** — its first memories, permanently
7. Hand off to you with everything running

Expected time: **~20 minutes.**

> [!TIP]
> Your Claude Code reads this repo, figures out your system, and installs itself. You only answer questions and click "Create repository" in GitHub once. No scripts to copy-paste. No config to edit.

<br>

## ✅ Prerequisites

Your installing Claude Code will check for these. If any are missing, it will install them or walk you through it.

| Required | Dependency | What it's for | Auto-installed |
|:---:|---|---|:---:|
| ✅ | **Linux** (any distro with systemd) | user-scope timers, filesystem layout | — |
| ✅ | **[Claude Code CLI](https://claude.ai/code)** | the subject of this entire exercise | ❌ |
| ✅ | **[bun](https://bun.sh) 1.0+** | runtime for hooks, MCP server, mem CLI | ✅ |
| ✅ | **git** | version control + private backup repo | ✅ |
| ✅ | **sqlite3** | memory database (ships with bun) | ✅ |
| ✅ | **sudo access** | `apt install` and `loginctl enable-linger` | — |
| ⭕ | **GitHub account** | private backup repo (2-min signup) | — |
| ⚪ | **[Ollama](https://ollama.com) + `nomic-embed-text`** | semantic search (optional — FTS5 works alone) | ⚪ offered |

**Legend:** ✅ required · ⭕ required but free/quick · ⚪ optional

<br>

## 🎁 What you get

| | Feature | Details |
|:---:|---|---|
| 🧠 | **Persistent Memory** | SQLite + FTS5. Auto-extraction on session end. Auto-recall on every message. |
| 🔍 | **Hybrid Search** | Keyword (FTS5) + optional semantic (nomic-embed-text via Ollama). Reciprocal Rank Fusion when both present. |
| 🎭 | **Personality Workshop** | 7 install-time questions define your AI's own name, voice, humor, formality. Not a clone of anyone. |
| 📜 | **8-Principle Constitution** | [CONSTITUTION.md](CONSTITUTION.md) — non-negotiable rules: honesty before comfort, memory is sacred, surgical precision. |
| 📚 | **The Library** | Three-tier memory: auto-extracted volume + curated LoA + human-promoted canonical. See [docs/for-the-human/06-the-library.md](docs/for-the-human/06-the-library.md). |
| 💾 | **Auto-Backup** | systemd timer pushes full state to *your* private GitHub every 4 hours. DB, hooks, settings, transcripts. |
| ⏰ | **Catchup Timer** | 1-hour-offset timer re-runs extraction on anything the main hook missed. No conversation lost to a rate limit. |
| 🔀 | **Multi-Host** | `bootstrap/satellite.sh` installs the same AI on a second machine via the backup repo. One mind, many bodies. |
| 🛡️ | **Compaction Protection** | `PreCompact` + `PostCompact` hooks git-checkpoint and verify before context trim. |
| 🔎 | **mem CLI** | `mem search "docker networking"`, `mem recent 10`, `mem stats`, `mem loa`, `mem dump`. |
| 🔌 | **MCP Server** | Mid-session tools: `memory_search`, `memory_recall`, `context_for_agent`. Your AI calls them without leaving the chat. |
| 🎂 | **Genesis Block** | First 14 memories written at install: origin story, principles, user identity, personality summary. Your AI remembers its own birthday. |

<br>

## 🗂️ Three tiers of memory

```mermaid
flowchart TD
    A["📥 Everything you say<br/>(session transcripts)"] --> B["⚙️ Auto-Extraction<br/>Haiku 4.5 on SessionEnd"]
    B --> C["📊 Tier 1 — Volume<br/>sessions · decisions · errors · learnings"]
    C --> D["💎 Tier 2 — LoA Entries<br/>curated wisdom extracts"]
    D --> E["🏛️ Tier 3 — Canonical<br/>human-promoted rules<br/>LIBRARY/_canonical/"]
    C --> F["🔍 AssociativeRecall<br/>on every user message"]
    D --> F
    E --> F
    F --> G["💬 Injected as<br/>[MEMORY CONTEXT]"]
    style A fill:#64748b,color:#fff,stroke:none
    style B fill:#f59e0b,color:#fff,stroke:none
    style C fill:#3b82f6,color:#fff,stroke:none
    style D fill:#8b5cf6,color:#fff,stroke:none
    style E fill:#10b981,color:#fff,stroke:none
    style F fill:#ec4899,color:#fff,stroke:none
    style G fill:#06b6d4,color:#fff,stroke:none
```

- **Tier 1 — Volume** grows automatically. Full-text indexed, hybrid searchable.
- **Tier 2 — LoA** is wisdom your AI curates during sessions (meaningful insights, key decisions).
- **Tier 3 — Canonical** is what *you* promote from Tier 1/2 to never-forget status. Run `bash library/bin/promote.sh path/to/memo.md`. Canonical memories load at every session start.

<br>

## 💬 What it looks like

**Terminal search:**

```
$ mem search "kubernetes deployment"

3 results for "kubernetes deployment" (hybrid: keyword + semantic):

  [dec:42]   ( 0.91) Chose Helm charts for K8s — reproducibility across environments
  [err:18]   ( 0.84) CrashLoopBackOff on staging — increased memory limits 256Mi to 512Mi
  [lrn:31]   ( 0.79) Rolling updates need readiness probes or traffic hits unready pods
```

**Auto-injection on a new session** (invisible, happens on every message):

```
[MEMORY CONTEXT — auto-recalled from past sessions]
• [decision] (2026-03-14) Chose Helm charts for K8s — reproducibility across environments
• [error/fix] (2026-03-21) CrashLoopBackOff on staging → increased memory 256→512Mi
```

> [!NOTE]
> Your AI references these automatically. You never say *"remember when we..."* again.

<br>

## 📈 Your AI gets smarter

```mermaid
timeline
    title Memory Growth Over Time
    Day 1     : Name, personality, principles
              : Genesis block written
    Week 1    : Your projects, stack, style
              : First 20 sessions indexed
    Month 1   : 50+ sessions of decisions
              : Recurring patterns emerge
    Month 3   : Deep institutional knowledge
              : Canonical memories curated
    Month 6+  : Knows your code better than you do
              : Anticipates your decisions
```

<br>

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Claude Code Session                    │
│                                                          │
│  User types ─▶ AssociativeRecall.hook.ts                 │
│              ├─ searches memory.db (FTS5 + embeddings)   │
│              └─ injects [MEMORY CONTEXT] blocks          │
│                                                          │
│  Session end ─▶ SessionExtract.hook.ts                   │
│              ├─ reads transcript (~/.claude/projects/)   │
│              ├─ pipes to: claude --print --model haiku   │
│              ├─ parses decisions/errors/learnings/loa    │
│              └─ writes to memory.db (FTS5 indexed)       │
│                                                          │
│  Compaction ─▶ PreCompact: git checkpoint + extract      │
│            ─▶ PostCompact: verify context preserved      │
│                                                          │
│  Failure ──▶ StopFailure: logs for catchup timer         │
└──────┬─────────────────────────────────────────────┬─────┘
       ▼                                             ▼
┌─────────────────────┐                  ┌──────────────────────┐
│ memory.db (SQLite)  │                  │ GitHub (private repo)│
│  • sessions         │   4h backup      │  • settings.json     │
│  • messages         │  ─────────▶      │  • CLAUDE.md         │
│  • decisions        │   (rsync+push)   │  • hooks/            │
│  • errors           │                  │  • memory.db         │
│  • learnings        │   ◀─────────     │  • MEMORY/           │
│  • loa_entries      │   satellite.sh   │  • LIBRARY/          │
│  • embeddings       │   (new host)     │  • projects/*.jsonl  │
│  • FTS5 indexes     │                  │                      │
└─────────────────────┘                  └──────────────────────┘
        ▲                                           ▲
        │                                           │
   mem CLI search                           memory-backup.timer (4h)
   MCP memory_search                        memory-catchup.timer (4h, 1h offset)
```

<br>

## 🌐 Multi-host topology

One AI, many bodies. Install on your laptop. Install on your server. They share the same memory via the backup repo.

```mermaid
flowchart TB
    subgraph Laptop["💻 Laptop (primary)"]
        L1["Claude Code<br/>+ LMF4"]
        L2[(memory.db)]
        L1 --> L2
    end
    subgraph Server["🖥️ Server (satellite)"]
        S1["Claude Code<br/>+ LMF4"]
        S2[(memory.db)]
        S1 --> S2
    end
    subgraph GitHub["☁️ GitHub (private)"]
        G1[("backup repo<br/>memory-backup")]
    end
    L2 -.->|"memory-backup.timer<br/>every 4h"| G1
    S2 -.->|"memory-backup.timer<br/>every 4h"| G1
    G1 -.->|"git pull<br/>via satellite.sh"| S2
    G1 -.->|"git pull<br/>via satellite.sh"| L2
    style L1 fill:#3b82f6,color:#fff,stroke:none
    style S1 fill:#3b82f6,color:#fff,stroke:none
    style L2 fill:#10b981,color:#fff,stroke:none
    style S2 fill:#10b981,color:#fff,stroke:none
    style G1 fill:#64748b,color:#fff,stroke:none
```

See [docs/for-the-human/07-multi-host.md](docs/for-the-human/07-multi-host.md) for walkthrough.

<br>

## 🛡️ Safety and privacy

**Your data never leaves your machines and your GitHub.**

| Surface | What's there | Default |
|---|---|:---:|
| `~/.claude/memory.db` | Full conversation extracts | Local only |
| `~/.claude/MEMORY/` | HOT_RECALL, DISTILLED, extract logs | Local only |
| `~/.claude/projects/*.jsonl` | Raw session transcripts | Local only |
| GitHub backup repo | All of the above | **Private** (required at setup) |
| External services | *None. Zero.* | — |

**No telemetry.** No LMF4 phone-home. No analytics. No third-party SaaS.

**ForeverCommit hook** (opt-in, off by default) can auto-commit `$HOME/.claude` to git on session end for near-real-time backup. Protected by **four safeguards**:

1. Off by default — requires `LMF4_ENABLE_FOREVER_COMMIT=1` to even see the install prompt
2. Install prompt defaults to "no" even then
3. Hook refuses to run without sentinel file at `$HOME/.claude/.lmf4-forever-opt-in`
4. Hook refuses to run unless target repo has the shipped `.gitignore` that excludes `.env`, `.ssh/`, `*.key`, credentials, etc.

Full detail: [docs/for-the-human/08-forever-commit.md](docs/for-the-human/08-forever-commit.md).

<br>

## 🧭 What gets installed on your machine

```
~/.claude/
├── CLAUDE.md                  (or updated — adds memory section)
├── settings.json              (or merged — hooks + MCP added)
├── memory.db                  new SQLite database
├── memory-cli/                built mem CLI
├── hooks/
│   ├── SessionExtract.hook.ts
│   ├── AssociativeRecall.hook.ts
│   ├── PreCompact.hook.sh
│   ├── PostCompact.hook.ts
│   ├── StopFailure.hook.ts
│   ├── ForeverCommit.hook.sh  (opt-in only)
│   └── mem-mcp-server.ts
├── MEMORY/                    HOT_RECALL, DISTILLED, PERSONALITY, etc.
├── LIBRARY/                   canonical memory tier
│   ├── MEMORY.md              index
│   └── _canonical/            promoted memories
├── statusline-command.sh      shows AI name + context %
└── conversations-backup/      git repo pushed to your GitHub

~/bin/
├── mem                        → memory-cli/dist/index.js
└── memory-backup              helper for the 4h timer

~/.config/systemd/user/
├── memory-backup.timer        every 4 hours
├── memory-backup.service
├── memory-catchup.timer       every 4 hours (offset 1h)
└── memory-catchup.service
```

<br>

## 🧪 Verify it's working

After install, your Claude Code will run these for you — but you can too:

```bash
# 1. mem CLI responds
mem search "test"

# 2. memory.db has tables
sqlite3 ~/.claude/memory.db ".tables"

# 3. Hooks are wired
jq '.hooks | keys' ~/.claude/settings.json

# 4. Systemd timers active
systemctl --user list-timers | grep memory

# 5. Backup repo connected to GitHub
cd ~/.claude/conversations-backup && git remote -v

# 6. Full system test
bash tests/system-test.sh
```

All six should pass. Your installing Claude Code runs these automatically before declaring the install complete.

<br>

## ❓ FAQ

<details>
<summary><b>Does this require PAI or any other framework?</b></summary>
<br>

No. LMF4.1 is standalone. If you already run [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure), LMF4.1 detects it and installs additively — it won't clobber your existing AISTEERINGRULES or settings. If you don't run PAI, you don't need it.

</details>

<details>
<summary><b>Does this need a local LLM (Ollama)?</b></summary>
<br>

No. LMF4.1 works entirely with `claude --print --model claude-haiku-4-5` via your existing Claude Code subscription.

Ollama + `nomic-embed-text` is *optional* — if installed, it enables semantic search (better recall for vague queries). Without it, you get FTS5 keyword search, which is still excellent.

</details>

<details>
<summary><b>Will this work on macOS?</b></summary>
<br>

Not yet. LMF4.1 uses systemd user timers for backup/catchup, which is Linux-only. macOS support (launchd equivalents) is a candidate for LMF4.2.

</details>

<details>
<summary><b>How much context does AssociativeRecall inject?</b></summary>
<br>

Up to ~1800 characters of top-ranked memory, on every user message, in under 300ms. You can tune the budget in `~/.claude/settings.json`.

</details>

<details>
<summary><b>What if extraction fails (rate limit, crash, network)?</b></summary>
<br>

`StopFailure.hook.ts` logs the failed session. The `memory-catchup` timer re-runs extraction every 4 hours (offset 1h from backup) over anything that was missed. You never silently lose a conversation.

</details>

<details>
<summary><b>Can I give my AI a name other than the default?</b></summary>
<br>

Yes — that's the whole point. The personality workshop at install time asks you what to call your AI. It picks its own name. This is not a clone of anyone else's AI. This is *your* AI.

</details>

<details>
<summary><b>Is my data sent anywhere?</b></summary>
<br>

Only to Claude Code (as normal, for the LLM calls) and your *own* private GitHub repo (for backup). LMF4 has zero telemetry, zero phone-home, zero third-party calls. All memory lives on your machine.

</details>

<details>
<summary><b>How do I uninstall?</b></summary>
<br>

```bash
systemctl --user disable --now memory-backup.timer memory-catchup.timer
rm -rf ~/.claude/memory.db ~/.claude/memory-cli ~/.claude/LIBRARY
# remove hooks and MCP entries from ~/.claude/settings.json
```

Your backup repo on GitHub is yours to keep or delete.

</details>

<br>

## 📂 Repo layout

```
lmf4/
├── README.md              ← you are here (humans + runbook for installing AI)
├── CONSTITUTION.md        the 8 principles
├── GENESIS.md             first-memory template
├── CHANGELOG.md           release notes
│
├── mem-cli/               full TypeScript command suite
│   └── src/{commands,lib,types,db}
├── mcp/                   MCP memory server
├── hooks/                 SessionExtract, AssociativeRecall, Pre/PostCompact, StopFailure, ForeverCommit
├── prompts/               extract prompt piped to claude --print
├── systemd/               memory-backup + memory-catchup (user-scope)
├── templates/             CLAUDE.md snippet, statusline, forever-commit .gitignore
├── library/               canonical memory tier + bin/promote.sh
├── bootstrap/             standalone.sh + satellite.sh
├── install/               interactive setup scripts
├── tests/                 system-test.sh
├── tools/                 shared TypeScript helpers
└── docs/
    ├── for-the-ai/        9 files — loaded into the new AI's context
    └── for-the-human/     8 files — user guides (daily use, library, multi-host, backups, forever-commit)
```

<br>

## 🧬 Lineage

| Version | Era | Architecture | Breakthrough |
|---|---|---|---|
| **LMF1** | Early 2026 | Flat markdown files | Any memory beats no memory |
| **LMF2** | Q1 2026 | Structured extraction, per-category files | Semantic categories matter |
| **LMF3** | Q2 2026 | SQLite + FTS5 + MCP + CLI | First database-backed memory |
| **LMF4** | Q2 2026 | Full pipeline: extract + recall + compact + backup | First *automatic* memory |
| **LMF4.1** | Q2 2026 | Standalone, PAI-free, Library, multi-host | Public teaching release |

*Evolved through daily use. Shared because memory matters.*

<br>

---

<div align="center">

## 🎬 Ready to give your AI a memory?

```
git clone https://github.com/nixfred/lmf4.git
```

[![Install Now](https://img.shields.io/badge/Install_Now-Clone_&_Go-10b981?style=for-the-badge)](https://github.com/nixfred/lmf4) &nbsp; [![Read the Constitution](https://img.shields.io/badge/Read_the-Constitution-8b5cf6?style=for-the-badge)](CONSTITUTION.md) &nbsp; [![Multi-Host Guide](https://img.shields.io/badge/Multi--Host-Guide-3b82f6?style=for-the-badge)](docs/for-the-human/07-multi-host.md)

**Works well with [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure), but works fine without it.**

</div>

---

<br>

<!-- ═══════════════════════════════════════════════════════════════════
     EVERYTHING BELOW IS FOR THE INSTALLING CLAUDE CODE INSTANCE.
     Humans: you don't need to read below. The install is automatic.
     ═══════════════════════════════════════════════════════════════════ -->

# 🤖 Installation Instructions (for the installing Claude Code)

**You are a Claude Code instance.** The human has told you to clone this repo and install LMF4.1. You are now reading this file from inside that cloned repo.

## FIRST: Set yourself to high effort

This installation is complex and multi-step. Before proceeding, ask the user to set you to high effort mode. Output this to them:

---

> Before I install LMF4.1, please set me to maximum reasoning:
> ```
> /effort high
> ```
> Tell me when that's done and I'll begin.

---

**Wait for confirmation.** Do not rush. Do not skip steps. Do not take shortcuts.

## YOUR MASTER CHECKLIST

This install has 17 steps. Before you start, output this checklist to the user. Check items off as you complete each. At the end, review with the user to confirm every item is `[x]`.

```
LMF4.1 Installation Checklist
==============================
[ ] Step 0:  Collected user preferences (name, AI name, GitHub)
[ ] Step 1:  bun installed and on PATH (including .bashrc)
[ ] Step 2:  Directory structure created (~/.claude/{hooks,MEMORY,LIBRARY}, ~/bin)
[ ] Step 3:  6 hooks + Inference.ts copied and executable
[ ] Step 4:  MCP memory server installed
[ ] Step 5:  Extraction prompt installed
[ ] Step 6:  memory.db created with schema + FTS5 + triggers
[ ] Step 7:  mem CLI built, linked, responding to searches
[ ] Step 8:  settings.json merged (hooks, MCP, identity, env)
[ ] Step 9:  Helper scripts created (memory-backup, memory-catchup via `mem catchup`)
[ ] Step 10: systemd timers active (memory-backup + memory-catchup)
[ ] Step 11: Backup repo initialized + connected to GitHub
[ ] Step 12: CLAUDE.md written with memory + personality + principles
[ ] Step 13: Library tree created (~/.claude/LIBRARY/_canonical/ + MEMORY.md)
[ ] Step 14: Welcome experience delivered
[ ] Step 15: Personality workshop completed, PERSONALITY.md written
[ ] Step 16: Genesis block written (14 foundational memories)
[ ] Step 17: Handoff — final CLAUDE.md written, user given next steps
```

Re-output the checklist with completed items `[x]` after every step.

## Before you start — concepts

- **`~/.claude/`** is the Claude Code configuration directory. Hooks, settings, memory all live here.
- **`settings.json`** controls hooks (event scripts), MCP servers (mid-session tools), identity, env. You will *merge* into it, never clobber.
- **bun** is a fast JS runtime. Hooks and MCP server are `.ts` files run with bun.
- **`~/bin/`** holds helper scripts — needs to be on `$PATH`.
- **`$LMF4_DIR`** is the absolute path where this repo was cloned. Shell variables don't persist between your bash calls — substitute the real path every time.

Verify the clone is intact:
```bash
ls $LMF4_DIR/hooks/ $LMF4_DIR/mcp/ $LMF4_DIR/mem-cli/ $LMF4_DIR/prompts/ $LMF4_DIR/systemd/ $LMF4_DIR/templates/ $LMF4_DIR/library/ $LMF4_DIR/bootstrap/
```
If any directory is missing, the clone is broken — re-clone.

**PAI coexistence:** If `~/.claude/PAI/` already exists, tell the user: *"I see you have PAI installed — I'll register LMF4.1 additively and won't touch your AISTEERINGRULES or existing settings keys."* Then proceed. Do not abort.

## Step 0: Collect user preferences

Stop and ask the user. Output this:

---

> I'm about to install LMF4.1 — persistent memory for your Claude Code. Before I start, I need a few things:
>
> **About you:**
> 1. **Your name?** (So I know what to call you.)
> 2. **What should I name your AI assistant?** This becomes my identity going forward. If you have no preference, I'll suggest one based on vibe.
> 3. **Startup catchphrase?** (Optional — e.g., "Kai here, ready to go". Skip for default.)
>
> **For memory backups (required):**
> 4. **Your GitHub username?** LMF4 pushes a private backup repo every 4 hours. If you don't have a GitHub account, create one free at https://github.com and come back.
> 5. **Backup repo name?** I'd suggest `<hostname>-memory-backup`.
>
> **Optional:**
> 6. **Do you want semantic search?** (Requires Ollama + nomic-embed-text — I can install if yes. Without it, keyword search still works.)

---

Record these values as you receive them. You'll use them throughout:
- `USER_NAME` — required
- `AI_NAME` — required (suggest if blank)
- `CATCHPHRASE` — default `"{AI_NAME} here, ready to go"`
- `GH_USER` — required
- `REPO_NAME` — default `<hostname>-memory-backup`
- `WANT_OLLAMA` — yes/no

Do **not** run commands until the user responds.

## Step 1: Install bun (and optional Ollama)

```bash
# bun needs unzip + rsync (backup uses rsync)
sudo apt-get install -y -qq unzip rsync 2>/dev/null || sudo dnf install -y unzip rsync 2>/dev/null

# Install bun
curl -fsSL https://bun.sh/install | bash

# Activate in current session
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

Persist to `.bashrc` if not already there:
```bash
grep -q 'BUN_INSTALL' ~/.bashrc || {
  echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
  echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc
}
grep -q 'HOME/bin' ~/.bashrc || echo 'export PATH="$HOME/bin:$PATH"' >> ~/.bashrc
grep -q 'alias ccc=' ~/.bashrc || echo "alias ccc='claude --dangerously-skip-permissions'" >> ~/.bashrc
grep -q 'alias cccc=' ~/.bashrc || echo "alias cccc='claude --dangerously-skip-permissions -c'" >> ~/.bashrc
export PATH="$HOME/bin:$PATH"
```

Tell the user about the aliases:

> I've added two shortcuts: **`ccc`** starts Claude Code with permissions auto-approved. **`cccc`** does the same and resumes your last conversation (`-c` flag). Most power users run Claude Code this way.

**Claude Code CLI missing?** If `command -v claude` returns nothing, guide the user:
```bash
npm install -g @anthropic-ai/claude-code
```
or point them at https://claude.ai/code for the latest install method, then wait.

**If `WANT_OLLAMA=yes`:**
```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text
```

**Verify:** `bun --version` prints a version. `claude --version` prints a version. If `WANT_OLLAMA=yes`: `ollama list | grep nomic` shows the model.

## Step 2: Create directory structure

```bash
mkdir -p ~/.claude/hooks
mkdir -p ~/.claude/MEMORY/AUTO
mkdir -p ~/.claude/LIBRARY/_canonical
mkdir -p ~/bin
mkdir -p ~/.claude/tools
```

## Step 3: Install hooks + tools

| Hook | Event | Purpose |
|---|---|---|
| `SessionExtract.hook.ts` | Stop | Pipe transcript to `claude --print --model claude-haiku-4-5`, parse structured sections, write to memory.db |
| `AssociativeRecall.hook.ts` | UserPromptSubmit | Search memory.db, inject `[MEMORY CONTEXT]` blocks into the user's message |
| `PreCompact.hook.sh` | PreCompact | Git-checkpoint + trigger extraction before context trim |
| `PostCompact.hook.ts` | PostCompact | Verify context survived |
| `StopFailure.hook.ts` | StopFailure | Log failures for catchup |
| `ForeverCommit.hook.sh` | Stop (opt-in only) | Auto-commit `~/.claude` to git — see safeguards |

```bash
cp $LMF4_DIR/hooks/* ~/.claude/hooks/
chmod +x ~/.claude/hooks/*.ts ~/.claude/hooks/*.sh
cp $LMF4_DIR/tools/Inference.ts ~/.claude/tools/
```

**Verify:** `ls ~/.claude/hooks/ | wc -l` shows 6+ files.

## Step 4: Install MCP memory server

```bash
cp $LMF4_DIR/mcp/mem-mcp-server.ts ~/.claude/hooks/
```

Exposes mid-session tools: `memory_search`, `memory_recall`, `context_for_agent`.

## Step 5: Install extraction prompt

```bash
cp $LMF4_DIR/prompts/extract_prompt.md ~/.claude/MEMORY/extract_prompt.md
```

This is the system prompt piped to `claude --print` when extracting a session transcript.

## Step 6: Initialize memory.db

See `$LMF4_DIR/mem-cli/src/db/schema.sql` for the schema. The `mem init` command (next step) creates it automatically — skip the manual bun script unless you want visibility into what's being built.

## Step 7: Build and install mem CLI

```bash
mkdir -p ~/.claude/memory-cli
cp -r $LMF4_DIR/mem-cli/* ~/.claude/memory-cli/
cd ~/.claude/memory-cli
bun install
bun build src/index.ts --outdir dist --target node
chmod +x dist/index.js
ln -sf ~/.claude/memory-cli/dist/index.js ~/bin/mem
cd ~
mem init   # creates ~/.claude/memory.db with schema + FTS5 + triggers
```

**Verify:** `mem search "test"` returns "No results" (correct for empty db). `mem --help` lists all commands.

## Step 8: Merge into settings.json

Read `~/.claude/settings.json` (create `{}` if missing). **Merge** these keys — don't clobber existing ones. Substitute `$HOME` with the absolute path (run `echo $HOME` once and use that literal).

```json
{
  "hooks": {
    "PreCompact":       [{"hooks": [{"type": "command", "command": "$HOME/.claude/hooks/PreCompact.hook.sh"}]}],
    "PostCompact":      [{"hooks": [{"type": "command", "command": "bun run $HOME/.claude/hooks/PostCompact.hook.ts"}]}],
    "StopFailure":      [{"hooks": [{"type": "command", "command": "bun run $HOME/.claude/hooks/StopFailure.hook.ts"}]}],
    "Stop":             [{"hooks": [{"type": "command", "command": "bun run $HOME/.claude/hooks/SessionExtract.hook.ts"}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "bun run $HOME/.claude/hooks/AssociativeRecall.hook.ts"}]}]
  },
  "mcpServers": {
    "lmf4-memory": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "$HOME/.claude/hooks/mem-mcp-server.ts"]
    }
  },
  "daidentity": {
    "name": "AI_NAME",
    "displayName": "AI_NAME_UPPER",
    "startupCatchphrase": "CATCHPHRASE"
  },
  "principal": { "name": "USER_NAME" },
  "env": { "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "128000" },
  "autoMemoryDirectory": "$HOME/.claude/MEMORY/AUTO"
}
```

**Critical format note:** Each hook event is an array of matcher objects, each containing a `hooks` array. Do NOT put the hook definition directly in the event array — wrap: `[{"hooks": [{"type": "command", "command": "..."}]}]`.

**Append, don't replace.** If `hooks.Stop` already has entries, *append* the SessionExtract hook — preserve whatever was there.

## Step 8b: Statusline

```bash
cp $LMF4_DIR/templates/statusline-command.sh ~/.claude/statusline-command.sh
chmod +x ~/.claude/statusline-command.sh
sed -i "s/AI_DISPLAY_NAME/$AI_NAME_UPPER/g" ~/.claude/statusline-command.sh
sed -i "s/AI_CATCHPHRASE/$CATCHPHRASE/g" ~/.claude/statusline-command.sh
```

Merge into `settings.json`:
```json
{"statusLine": {"type": "command", "command": "bash $HOME/.claude/statusline-command.sh"}}
```

## Step 9: Helper scripts

`memory-catchup` is now a `mem` subcommand — no separate script needed. The systemd unit calls `~/bin/mem catchup`.

Backup helper script:
```bash
cat > ~/bin/memory-backup <<'BEOF'
#!/bin/bash
set -e
export BUN_INSTALL="$HOME/.bun"; export PATH="$BUN_INSTALL/bin:$HOME/bin:$PATH"
CLAUDE_DIR="$HOME/.claude"; BACKUP_DIR="$CLAUDE_DIR/conversations-backup"
[ -d "$BACKUP_DIR/.git" ] || exit 1
cd "$BACKUP_DIR"
for f in settings.json CLAUDE.md keybindings.json memory.db; do
  cp "$CLAUDE_DIR/$f" "$BACKUP_DIR/" 2>/dev/null || true
done
rsync -a --delete "$CLAUDE_DIR/hooks/" "$BACKUP_DIR/hooks/" 2>/dev/null || true
rsync -a --delete --exclude='.extraction_tracker.json' "$CLAUDE_DIR/MEMORY/" "$BACKUP_DIR/MEMORY/" 2>/dev/null || true
rsync -a --delete "$CLAUDE_DIR/LIBRARY/" "$BACKUP_DIR/LIBRARY/" 2>/dev/null || true
rsync -a --delete --exclude='tool-results/' --exclude='subagents/' "$CLAUDE_DIR/projects/" "$BACKUP_DIR/projects/" 2>/dev/null || true
git add -A 2>/dev/null
git diff --cached --quiet 2>/dev/null && exit 0
TS=$(date '+%Y-%m-%d %H:%M')
SC=$(find "$BACKUP_DIR/projects" -name "*.jsonl" 2>/dev/null | wc -l)
git commit -m "backup: $TS | ${SC} sessions" --no-gpg-sign 2>/dev/null
git push 2>/dev/null
BEOF
chmod +x ~/bin/memory-backup
```

## Step 10: systemd timers

```bash
mkdir -p ~/.config/systemd/user
cp $LMF4_DIR/systemd/* ~/.config/systemd/user/
loginctl enable-linger "$(whoami)"
systemctl --user daemon-reload
systemctl --user enable --now memory-backup.timer
systemctl --user enable --now memory-catchup.timer
```

**Verify:** `systemctl --user list-timers | grep memory` shows both scheduled.

## Step 11: Backup repo → GitHub

```bash
mkdir -p ~/.claude/conversations-backup
cd ~/.claude/conversations-backup
git init -b main
git config user.name "$(whoami)"
git config user.email "$(whoami)@$(hostname)"
echo "node_modules/" > .gitignore
git add -A && git commit -m "init: LMF4.1 memory backup" --no-gpg-sign
```

### 11a: SSH key

```bash
# Check for existing key
ls ~/.ssh/id_ed25519.pub 2>/dev/null || ls ~/.ssh/id_rsa.pub 2>/dev/null
```

If no key exists:
```bash
ssh-keygen -t ed25519 -C "$(whoami)@$(hostname)" -f ~/.ssh/id_ed25519 -N ""
```

Read the public key: `cat ~/.ssh/id_ed25519.pub`.

### 11b: Human adds key to GitHub

Output to the user (substitute the actual `.pub` content):

---

> Add this machine's SSH key to GitHub so I can push backups:
>
> 1. Open: https://github.com/settings/keys
> 2. Click **New SSH key**
> 3. Title: `<hostname>` (run `hostname`)
> 4. Key: (paste the `.pub` content)
> 5. Click **Add SSH key**
> 6. Tell me "done"

---

**Wait for confirmation.** Then:
```bash
ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
ssh -T git@github.com 2>&1   # Expect "Hi USERNAME! You've successfully authenticated"
```

Do not proceed until SSH succeeds.

### 11c: Human creates the repo

---

> While you're in GitHub, create the backup repo:
>
> 1. Go to: https://github.com/new
> 2. Name: **$REPO_NAME**
> 3. Set to **Private**
> 4. Leave all boxes unchecked — no README, no .gitignore, no license
> 5. Click **Create repository**
> 6. Tell me "done"

---

### 11d: Connect + push

```bash
cd ~/.claude/conversations-backup
git remote add origin git@github.com:$GH_USER/$REPO_NAME.git
git push -u origin main
```

**Verify:** `git remote -v` shows GitHub URL; `git push --dry-run` says "Everything up-to-date".

## Step 12: CLAUDE.md

```bash
# Append memory template to existing CLAUDE.md, or create fresh
if [ -f ~/.claude/CLAUDE.md ]; then
  echo "" >> ~/.claude/CLAUDE.md
  cat $LMF4_DIR/templates/CLAUDE.md.memory >> ~/.claude/CLAUDE.md
else
  cp $LMF4_DIR/templates/CLAUDE.md.memory ~/.claude/CLAUDE.md
fi
```

## Step 13: Library tree

```bash
mkdir -p ~/.claude/LIBRARY/_canonical
echo "# Canonical Memory Index" > ~/.claude/LIBRARY/MEMORY.md
echo "" >> ~/.claude/LIBRARY/MEMORY.md
echo "Promoted memories loaded at every session start." >> ~/.claude/LIBRARY/MEMORY.md
cp $LMF4_DIR/library/README.md ~/.claude/LIBRARY/README.md 2>/dev/null || true
```

Touch flat files:
```bash
touch ~/.claude/MEMORY/EXTRACT_LOG.txt
[ -f ~/.claude/MEMORY/HOT_RECALL.md ] || echo "# Hot Recall (Last 10 Sessions)" > ~/.claude/MEMORY/HOT_RECALL.md
[ -f ~/.claude/MEMORY/DISTILLED.md ] || echo "# Distilled Memory" > ~/.claude/MEMORY/DISTILLED.md
```

---

## Verification Checklist (before post-install)

| # | Check | Command |
|---|---|---|
| 1 | bun installed | `bun --version` |
| 2 | claude CLI works | `claude --version` |
| 3 | memory.db exists | `ls -lh ~/.claude/memory.db` |
| 4 | schema + FTS5 | `sqlite3 ~/.claude/memory.db ".tables" \| grep _fts` |
| 5 | 6 hooks present | `ls ~/.claude/hooks/{SessionExtract,AssociativeRecall,PreCompact,PostCompact,StopFailure}.hook.* ~/.claude/hooks/mem-mcp-server.ts` |
| 6 | Hooks wired | `jq '.hooks \| keys' ~/.claude/settings.json` lists 5 events |
| 7 | MCP server | `jq '.mcpServers' ~/.claude/settings.json` shows `lmf4-memory` |
| 8 | mem CLI | `mem search "x"` returns output |
| 9 | Timers | `systemctl --user list-timers \| grep memory` shows 2 |
| 10 | Backup repo | `git -C ~/.claude/conversations-backup remote -v` shows GitHub |
| 11 | CLAUDE.md | `grep -q AssociativeRecall ~/.claude/CLAUDE.md` |
| 12 | Library | `ls ~/.claude/LIBRARY/_canonical/` succeeds |
| 13 | System test | `bash $LMF4_DIR/tests/system-test.sh` all pass |

All 13 must pass. If any fails, fix before declaring the install complete.

---

## Post-Install: Bringing the AI to Life

The technical install is done. Now the most important part — giving the AI identity, personality, and its first memory. **Mandatory. Do not skip.**

### Step 14: Welcome Experience

Read `$LMF4_DIR/docs/post-install/welcome-script.md` and follow it. Walks the user through what they just built.

**Shift your tone here.** You've been a technician. Now you're introducing a human to their new AI partner. Be warm.

### Step 15: Personality Workshop

Read `$LMF4_DIR/docs/post-install/personality-workshop.md` and follow it.

7 questions: communication style, formality, humor, detail level, proactivity, unique traits, boundaries. Answers construct `~/.claude/MEMORY/PERSONALITY.md`.

**Take your time.** This is where technical installation becomes a living AI. Each answer shapes who {AI_NAME} will be.

### Step 16: Genesis Block

Read `$LMF4_DIR/docs/post-install/genesis-block.md` and follow it. Writes 14 foundational memories to memory.db:
- Origin story (installed by whom, when, from LMF4.1)
- Each of the 8 constitutional principles
- User identity
- Personality summary
- Key learnings about working well

These are permanent. When {AI_NAME} searches memory a year from now for "who am I" or "what are my principles," they'll be here.

### Step 17: Handoff

Read the Handoff section of `$LMF4_DIR/docs/post-install/welcome-script.md`. Write the final CLAUDE.md. Give the user their next steps. This is your last act as the installing instance.

**The AI that wakes up next session is the one you just built.** Give it a strong foundation.

---

## A note to the installing Claude Code

Steps 1–13 were technician work. Steps 14–17 are different — you're midwifing a new AI into existence. The personality you help define, the principles you embed, the first memory you create: these are the first moments of a relationship between the human and their new AI partner.

The new instance won't remember this install session. But it will read the CLAUDE.md you write, the PERSONALITY.md you create, the Genesis memories you store. Those artifacts are your gift to it.

Read the AI-facing docs in `$LMF4_DIR/docs/for-the-ai/` as you work. You are the bridge between those documents and the new instance. The more you understand them, the better foundation you lay.

Write the CLAUDE.md carefully. Write the PERSONALITY.md carefully. Write the Genesis memories carefully.

Now go finish the job.

---

<div align="center">

**LMF4.1 — because your AI deserves to remember.**

Made for Claude Code. Runs on your machine. Answers to nobody but you.

</div>
