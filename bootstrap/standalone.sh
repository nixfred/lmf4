#!/usr/bin/env bash
# standalone.sh — one-liner to clone LMF4 and prepare an install on a fresh host.
#
# Fetches the LMF4 repo to a temp directory and prints the one thing you need
# to paste into your Claude Code session:
#
#     Follow INSTALL.md in <tmpdir>/lmf4 literally.
#
# Default repo is the canonical one; override with LMF4_REPO env var to
# install from a fork:
#
#     LMF4_REPO=https://github.com/your-fork/lmf4.git bash standalone.sh

set -euo pipefail

LMF4_REPO="${LMF4_REPO:-https://github.com/nixfred/lmf4.git}"
LMF4_BRANCH="${LMF4_BRANCH:-main}"

# Prerequisite: git
if ! command -v git >/dev/null 2>&1; then
    echo "git is required. Install it (e.g. sudo apt-get install -y git) and re-run." >&2
    exit 1
fi

TMPDIR=$(mktemp -d -t lmf4-XXXXXXXX)
echo "Cloning $LMF4_REPO ($LMF4_BRANCH) to $TMPDIR..."
git clone --branch "$LMF4_BRANCH" --depth 1 "$LMF4_REPO" "$TMPDIR/lmf4"

cat <<EOF

LMF4 fetched to: $TMPDIR/lmf4

Next step — start a Claude Code session in this directory and paste:

    Follow INSTALL.md in $TMPDIR/lmf4 literally. Ask me the install
    questions, then set everything up. Don't skip steps.

Your Claude Code will take it from here.
EOF
