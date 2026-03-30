# First Memory Exercise

**For the installing Claude Code instance:** This is a brief exercise to prove the memory system works and create the first entry in the database. Do this after the personality workshop and before the handoff.

---

## The Exercise

Output this to the user (replace `{AI_NAME}` with the actual AI name from Step 0 — do NOT output the literal text "{AI_NAME}"):

---

Before I hand things over to {AI_NAME}, let's create a first memory. This proves everything works and gives {AI_NAME} something to find when it wakes up.

**Tell me something about yourself or your work.** It can be anything:
- What project you're working on right now
- What you do for a living
- A fun fact about yourself
- Why you decided to set up an AI with memory

Whatever you share, {AI_NAME} will remember it.

---

Wait for their response. Then:

1. **Acknowledge what they shared** naturally — don't just say "noted."
2. **Write it into the memory database** so it's there immediately (don't wait for extraction):

```bash
bun -e "
const db = new (require('bun:sqlite').Database)(process.env.HOME + '/.claude/memory.db');
// NOTE: Do NOT insert into loa_fts manually — the trigger handles FTS sync automatically
db.prepare('INSERT INTO loa_entries (title, fabric_extract, session_id, project) VALUES (?, ?, ?, ?)').run(
  'First Memory — LMF4 Installation',
  'FIRST_MEMORY_CONTENT',
  'lmf4-install',
  'LMF4'
);
db.close();
console.log('First memory saved.');
"
```

Replace `FIRST_MEMORY_CONTENT` with a well-written summary of what the user told you. Include their name, what they shared, and the date. Something like:

> "{USER_NAME} shared during LMF4 installation on {DATE}: They're a software engineer working on a Kubernetes platform for their company. They set up memory because they wanted their AI to be more than a disposable tool. This is {AI_NAME}'s first memory."

3. **Verify it's searchable:**

```bash
mem search "first memory"
```

This should return the entry you just created.

4. **Tell the user:**

---

Done — that's {AI_NAME}'s first memory, now stored in the database. When {AI_NAME} wakes up next session and you mention {the topic they shared}, it'll know exactly what you're talking about.

Let's finish up.

---

Then proceed to the Handoff section of the welcome script.
