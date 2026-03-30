# Backups

Your AI's entire state — memory, configuration, personality, conversation history — is automatically backed up to your private GitHub repository.

---

## What Gets Backed Up

| Item | Location | Size |
|------|----------|------|
| Memory database | `memory.db` | Grows over time (starts at ~150KB, can reach 100MB+) |
| Settings | `settings.json` | ~2-40KB |
| CLAUDE.md | Identity and instructions | ~1-5KB |
| Hooks | `hooks/` directory | ~80KB |
| Memory flat files | `MEMORY/` directory | Grows over time |
| Conversation transcripts | `projects/` directory | ~1-5MB per session |

## When Backups Run

- **Every 4 hours** via systemd timer (`memory-backup.timer`)
- **Before context compaction** via PreCompact hook (git checkpoint)

You can check when the last backup ran:
```bash
systemctl --user list-timers | grep memory-backup
```

## Manual Backup

If you want to back up right now:
```bash
~/bin/memory-backup
```

## Checking Backup Health

```bash
# Recent backup commits
cd ~/.claude/conversations-backup && git log --oneline -10

# Check if remote push is working
cd ~/.claude/conversations-backup && git push --dry-run

# Check total backup size
du -sh ~/.claude/conversations-backup --exclude='.git'
```

## Restoring From Backup

If the machine dies or you want to set up on a new machine:

```bash
# Clone the backup repo
git clone git@github.com:YOUR_USER/YOUR_REPO.git ~/.claude/conversations-backup

# Copy everything back
cp ~/.claude/conversations-backup/settings.json ~/.claude/
cp ~/.claude/conversations-backup/memory.db ~/.claude/
rsync -a ~/.claude/conversations-backup/hooks/ ~/.claude/hooks/
rsync -a ~/.claude/conversations-backup/MEMORY/ ~/.claude/MEMORY/
rsync -a ~/.claude/conversations-backup/projects/ ~/.claude/projects/
```

Your AI will come back with all its memories, personality, and configuration intact.

## Privacy

Your backup repository should be **private**. It contains:
- Your conversation transcripts (everything you've discussed with your AI)
- Your AI's memory (decisions, errors, learnings)
- Your configuration (which may contain paths, hostnames, etc.)

This data is yours. It lives in your GitHub account. No one else has access unless you grant it.
