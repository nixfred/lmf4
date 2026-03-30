# Daily Use

How to work with your AI now that it has memory.

---

## Starting a Session

Just start Claude Code normally. Nothing changes about how you launch it. The memory system works in the background.

When you type your first message, your AI's memory is automatically searched for relevant context. You might notice slightly faster responses on topics you've discussed before — that's memory recall injecting context.

## Natural Conversation

The best way to use memory is to not think about it. Just work normally:

- **Reference past work casually.** "Let's pick up where we left off with the API." Your AI will search memory and find the context.
- **Ask about past decisions.** "Why did we choose PostgreSQL?" Your AI will find the decision and the reasoning.
- **Mention past problems.** "We had a similar issue with the cache last month." Your AI will search for it.

If your AI doesn't find what you're looking for, it'll tell you honestly. You can be more specific: "Search your memory for 'Redis cache timeout'" and it will do a deeper search.

## Giving Feedback

Your AI learns from corrections. When it does something wrong:
- Tell it directly: "That's not right — we use X approach, not Y"
- Explain why if possible: "We chose X because of the compliance requirements"
- The correction will be captured in the next session extraction

When it does something well:
- A simple "perfect" or "yes, exactly" reinforces the behavior
- "Keep doing that" is powerful — it tells the AI this was a deliberate good choice

## Editing Personality

Your AI's personality lives in `~/.claude/MEMORY/PERSONALITY.md`. Open it in any text editor:

```bash
nano ~/.claude/MEMORY/PERSONALITY.md
# or
vim ~/.claude/MEMORY/PERSONALITY.md
```

Changes take effect in the next session. You can change:
- Communication style (formal ↔ casual)
- Humor level
- Response length preference
- Specific quirks or traits
- Things you don't want (boundaries)

## Checking Memory Health

If you suspect memory isn't working:

```bash
# Check extraction log for recent activity
tail -20 ~/.claude/MEMORY/EXTRACT_LOG.txt

# Check database size (should grow over time)
ls -lh ~/.claude/memory.db

# Check backup status
cd ~/.claude/conversations-backup && git log --oneline -5

# Check timers are running
systemctl --user list-timers | grep memory
```

## Backup and Recovery

Your memory is backed up to GitHub every 4 hours. If something goes wrong:

```bash
# See backup history
cd ~/.claude/conversations-backup && git log --oneline -20

# Check when last backup ran
systemctl --user list-timers | grep memory

# Manual backup (if you want to force one)
~/bin/memory-backup
```

If the machine dies entirely, you can restore from the GitHub repo. Clone it on a new machine and run the LMF4 installer — your memory comes back.

## Tips

- **Be descriptive in your conversations.** The more context you provide, the richer the memory extractions. "Fix the bug" produces worse memory than "Fix the authentication timeout in the login API endpoint."
- **Don't worry about "wasting" conversations.** Every session adds value to memory, even casual ones.
- **Your AI gets better over time.** Session 5 is noticeably different from session 50. Be patient with early sessions.
- **Memory is searchable, not perfect.** It captures the gist, not every word. For exact details, always check the code/files directly.
