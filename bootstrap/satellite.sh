#!/usr/bin/env bash
# satellite.sh — add a new host to an existing LMF4 AI by cloning the
# backup repo into ~/.claude and wiring up hooks/MCP/mem CLI.
#
# Use this when you already run LMF4 on one machine (machine A) and want
# the same AI — same memory, same personality, same principles — on a new
# machine (machine B). The glue is the private backup repo that machine A
# pushes to every 4 hours.
#
# Usage:
#     bash satellite.sh <backup-repo-ssh-url> [lmf4-repo-url]
#
# Example:
#     bash satellite.sh git@github.com:USER/myhost-memory-backup.git
#
# This does NOT replace the install. It:
#   1. Clones the backup repo into ~/.claude
#   2. Clones LMF4 to a temp dir
#   3. Prints the instruction for your Claude Code on this host to run
#      install/03-core.sh which rebuilds the mem CLI + wires hooks
#      against the already-populated ~/.claude.

set -euo pipefail

BACKUP_REPO="${1:-}"
LMF4_REPO="${2:-${LMF4_REPO:-https://github.com/nixfred/lmf4.git}}"

if [ -z "$BACKUP_REPO" ]; then
    cat <<EOF >&2
Usage: $0 <backup-repo-ssh-url> [lmf4-repo-url]

Example:
    $0 git@github.com:USER/myhost-memory-backup.git

The backup repo URL is what your existing LMF4 host pushes to every 4h.
You need SSH access to it from this new host — add this host's SSH key
to GitHub first.
EOF
    exit 1
fi

# Prerequisites
for cmd in git ssh; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "$cmd is required. Install it and re-run." >&2
        exit 1
    fi
done

CLAUDE_DIR="$HOME/.claude"

if [ -d "$CLAUDE_DIR" ] && [ "$(ls -A "$CLAUDE_DIR" 2>/dev/null | head -1)" ]; then
    echo "$CLAUDE_DIR already exists and is non-empty." >&2
    echo "Move or back it up first; satellite.sh refuses to overwrite." >&2
    exit 1
fi

echo "Cloning backup repo $BACKUP_REPO -> $CLAUDE_DIR..."
git clone "$BACKUP_REPO" "$CLAUDE_DIR"

TMPDIR=$(mktemp -d -t lmf4-XXXXXXXX)
echo "Cloning LMF4 repo $LMF4_REPO -> $TMPDIR/lmf4..."
git clone --depth 1 "$LMF4_REPO" "$TMPDIR/lmf4"

cat <<EOF

Backup repo restored to: $CLAUDE_DIR
LMF4 source fetched to:  $TMPDIR/lmf4

Next step — start a Claude Code session on this host and paste:

    I cloned the LMF4 repo to $TMPDIR/lmf4 and restored our shared
    backup into ~/.claude. Please run install/03-core.sh from that
    directory to rebuild the mem CLI and wire up hooks/MCP on this host.
    Don't reinitialize memory.db (it already has our history) and don't
    overwrite settings.json (it's from the backup).

Your Claude Code will take it from there. When done, this host will
share the same memory + identity as the origin host.
EOF
