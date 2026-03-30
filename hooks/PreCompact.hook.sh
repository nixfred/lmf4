#!/bin/bash
#######################################################################
# PreCompact.hook.sh — Fires before Claude compacts conversation context
#
# Two actions:
# 1. Trigger FabricExtract on current session (preserves context about to be lost)
# 2. Git checkpoint all JSONL files (raw transcript backup)
#
# This is the "last chance" to capture full context before compaction
# strips older messages from Claude's working memory.
#######################################################################

MEMORY_DIR="$HOME/.claude/MEMORY"
EXTRACT_LOG="$MEMORY_DIR/EXTRACT_LOG.txt"
PROJECTS_DIR="$HOME/.claude/projects"

log() { echo "[$(date -Iseconds)] PRECOMPACT: $1" >> "$EXTRACT_LOG"; }

log "PreCompact hook fired"

# Read stdin for hook input (cwd)
INPUT=$(cat)
CWD=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('cwd',''))" 2>/dev/null)

if [ -z "$CWD" ]; then
    CWD="$(pwd)"
fi

# 1. Trigger extraction via FabricExtract (background, non-blocking)
HOOK_PATH="$HOME/.claude/hooks/FabricExtract.hook.ts"
if [ -f "$HOOK_PATH" ]; then
    echo "$INPUT" | bun run "$HOOK_PATH" &
    log "Triggered FabricExtract"
fi

# 2. Git checkpoint the conversation backup repo (if it exists)
BACKUP_REPO="$HOME/.claude/conversations-backup"
if [ -d "$BACKUP_REPO/.git" ]; then
    cd "$BACKUP_REPO"
    # Sync latest JONLs
    rsync -a --include='*/' --include='*.jsonl' --exclude='*' \
        "$PROJECTS_DIR/" "$BACKUP_REPO/projects/" 2>/dev/null

    git add -A 2>/dev/null
    if ! git diff --cached --quiet 2>/dev/null; then
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
        git commit -m "pre-compaction checkpoint: $TIMESTAMP" --no-gpg-sign 2>/dev/null
        log "Git checkpoint committed"
        # Push in background
        git push 2>/dev/null &
    fi
fi

log "PreCompact hook complete"
exit 0
