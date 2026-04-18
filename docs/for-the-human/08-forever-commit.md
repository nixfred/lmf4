# ForeverCommit — Auto-Git-Commit Your Home Directory

## ⚠️  Read This Before Enabling

ForeverCommit is an opt-in hook that commits your target directory (default `~/.claude`, optionally `$HOME` itself) to a private git repo on every SessionEnd. It's a power-user feature that gives you a complete audit trail of changes to your AI state. It's also a foot-gun: misconfigured, it will commit your secrets to git.

**Ship defaults are pessimistic on purpose.** This hook won't run unless you take four separate explicit actions. If you skip any of them, the hook exits silently.

## The Four Safeguards

1. **Environment gate at install time:** `LMF4_ENABLE_FOREVER_COMMIT=1` must be set when you run the install script. Without it, the installer won't even offer to wire the hook.
2. **Sentinel file:** `~/.claude/.lmf4-forever-opt-in` must exist and contain your config (target directory, optional remote, branch). The installer creates this only after you explicitly consent.
3. **gitignore check:** The target directory's `.gitignore` must contain the required secret-exclusion patterns. The hook refuses to run otherwise.
4. **$HOME extra guard:** If the target is literally `$HOME` (not `$HOME/.claude`), a second sentinel `~/.lmf4-forever-commit-home-confirmed` is required. $HOME has a much larger secret surface than `~/.claude` and deserves the extra friction.

## What Gets Committed

By default: everything in `~/.claude/` that isn't ignored, including:
- `settings.json`
- `CLAUDE.md`
- `hooks/`
- `MEMORY/`
- `memory.db` (+ its -wal/-shm if gitignore allows)
- `projects/` (your full conversation transcripts)

Excluded by the shipped `.gitignore` template (`templates/forever-commit.gitignore`):
- `.env*`, `*.env`
- `.ssh/`, `.aws/`, `.gnupg/`, `.docker/config.json`, `.netrc`, `.pgpass`, `.npmrc`
- `*.key`, `*.pem`, `id_rsa*`, `id_ed25519*`
- `**/secret*`, `**/token*`, `**/*credential*`, `**/auth.json`
- `*.sqlite-wal`, `*.sqlite-shm` (transient, not useful)
- `node_modules/`, `.cache/`, `dist/`, `build/`
- `*.iso`, `*.mp4` (storage bloat)

**You can and should audit `templates/forever-commit.gitignore` before copying it.** Add anything specific to your setup.

## Setup (if you're sure)

1. **Install Ollama**... wait, wrong tool. Start from the beginning:

2. **Copy the gitignore template:**

   ```bash
   cp /path/to/lmf4/templates/forever-commit.gitignore ~/.claude/.gitignore
   ```

3. **Init the target as a git repo** (if it isn't already):

   ```bash
   cd ~/.claude
   git init -b main
   git add -A
   git commit -m "init: ForeverCommit baseline" --no-gpg-sign
   ```

4. **Create a private git remote** (GitHub private repo recommended), then:

   ```bash
   cd ~/.claude
   git remote add origin git@github.com:yourhandle/claude-state-forever.git
   git push -u origin main
   ```

5. **Create the sentinel file** with your config:

   ```bash
   cat > ~/.claude/.lmf4-forever-opt-in <<EOF
   target_dir=$HOME/.claude
   remote=git@github.com:yourhandle/claude-state-forever.git
   branch=main
   EOF
   ```

6. **Re-run install with the env flag set** so the hook is wired into `settings.json`:

   ```bash
   LMF4_ENABLE_FOREVER_COMMIT=1 ./install
   ```

   The installer will prompt you to confirm. Default is still "no" — you have to actively say yes.

7. **Test it:** End a Claude Code session. Check `~/.claude/` git log — you should see a new commit.

## Disabling

Any one of these turns the hook off:

- Delete `~/.claude/.lmf4-forever-opt-in`
- Unset `LMF4_ENABLE_FOREVER_COMMIT` (or set to `0`) in the hook environment
- Remove the hook wiring from `~/.claude/settings.json`

## If You Already Committed a Secret

1. **Don't panic, but act fast.** Git history is rewritable until it's pulled by others.
2. Rotate the secret first (regenerate the key, change the password, whatever). Assume it's compromised.
3. Rewrite history with [`git filter-repo`](https://github.com/newren/git-filter-repo) to purge the secret from all commits.
4. Force-push.
5. Audit your `.gitignore` and add the pattern that let it through. Consider adding [`git-secrets`](https://github.com/awslabs/git-secrets) as a pre-commit hook.

## Recommended Alternative

If ForeverCommit feels like too much risk, the normal LMF4 backup (`memory-backup.timer`) already pushes `~/.claude/` to a private repo every 4 hours with the same secret-exclusion discipline. That's enough for most people. ForeverCommit is for the subset who want per-session granularity and are disciplined about secrets hygiene.
