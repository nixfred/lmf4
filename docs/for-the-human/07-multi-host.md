# Running LMF4 Across Multiple Machines

You can run the same AI — same memory, same identity, same principles — on multiple machines. The glue is your private backup repo.

## The Model

- **Host A** is your primary. Runs LMF4. Every 4 hours, the `memory-backup` timer pushes `~/.claude/` to a private git repo (you set this up during install).
- **Host B** is a new machine. Instead of installing fresh and starting from zero, it clones your backup repo into its `~/.claude/`, then wires up hooks and the mem CLI.
- Result: both machines run the same AI. Memory written on A shows up on B after the next backup + pull.

## Caveats

- **Eventual consistency.** Memory changes on one host aren't instantly visible on the other. They propagate on the next backup cycle (up to 4 hours) plus your pull cadence on the receiving host. If you need real-time sync, LMF4 is not the right tool.
- **Don't write simultaneously on both hosts.** Running active sessions on A and B at the same time will produce divergent memory.db files — then next backup-push overwrites whoever pushed second. Keep it one-host-at-a-time.
- **SQLite, not a server DB.** `memory.db` is a file. It's safe for one writer. The backup repo is the sync channel, not a live database.

## Setup — Host A (primary, one-time)

You already did this during the normal install. If not, the core requirement is:

- Private GitHub repo exists (e.g., `yourhandle/myhost-memory-backup`)
- `~/.claude/conversations-backup/` is a git repo with that remote
- `memory-backup.timer` is enabled

## Setup — Host B (satellite, one-time)

On the new host, before running the full install:

1. Add this host's SSH key to GitHub so it can clone the backup repo.
2. Run:

   ```bash
   bash /path/to/lmf4/bootstrap/satellite.sh git@github.com:yourhandle/myhost-memory-backup.git
   ```

3. Follow the instruction the script prints: start Claude Code, paste the given prompt, and let it run `install/03-core.sh` to build mem CLI + wire hooks without reinitializing `memory.db`.

After this, both hosts share memory.

## Day-to-day — Host B

Before starting a session on host B (if host A has been the active one recently), pull fresh backup:

```bash
cd ~/.claude/conversations-backup && git pull
```

The hooks and mem CLI on host B already know where `memory.db` is (`~/.claude/memory.db`), so no other action is needed. Your AI will see everything from A.

When you finish a session on B, the `memory-backup` timer on B will push changes to the same backup repo. Next time you use A, pull before starting a session:

```bash
cd ~/.claude/conversations-backup && git pull
```

## Making Pull Automatic

If you want pre-session pulls without thinking about them, add this to your shell rc or a wrapper around your Claude Code launcher:

```bash
cc() {
    (cd "$HOME/.claude/conversations-backup" && git pull --quiet) 2>/dev/null
    claude "$@"
}
```

Now `cc` pulls fresh before every session start. The pull is quiet; failures (no network, auth issue) don't block you.

## Promotion Note

Canonical memory files in `~/.claude/LIBRARY/` sync through the same backup channel. Promoting on one host propagates to all hosts on next sync. That's usually what you want — the whole point of canonical is "same rule everywhere".
