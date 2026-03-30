#!/usr/bin/env bun
/**
 * mem — Memory CLI for Claude Code
 *
 * SQLite + FTS5 memory system. Search, add, import, query.
 * Database: ~/.claude/memory.db
 */

import { Database } from 'bun:sqlite';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';

const DB_PATH = join(process.env.HOME!, '.claude', 'memory.db');
const MEMORY_DIR = join(process.env.HOME!, '.claude', 'MEMORY');
const PROJECTS_DIR = join(process.env.HOME!, '.claude', 'projects');

// ─── Database ──────────────────────────────────────────────────────

function getDb(): Database {
  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode=WAL');
  db.run('PRAGMA foreign_keys=ON');
  return db;
}

function initDb(): void {
  const db = getDb();

  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    summary TEXT,
    project TEXT,
    cwd TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    project TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    session_id TEXT,
    project TEXT,
    decision TEXT NOT NULL,
    reasoning TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'reverted'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS learnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    session_id TEXT,
    project TEXT,
    problem TEXT NOT NULL,
    solution TEXT,
    tags TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    error TEXT NOT NULL,
    cause TEXT,
    fix TEXT,
    frequency INTEGER DEFAULT 1,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS loa_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    title TEXT NOT NULL,
    fabric_extract TEXT NOT NULL,
    session_id TEXT,
    project TEXT,
    tags TEXT
  )`);

  // FTS5 indexes
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content_rowid='id', tokenize='porter')`);
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(decision, reasoning, content_rowid='id', tokenize='porter')`);
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS learnings_fts USING fts5(problem, solution, content_rowid='id', tokenize='porter')`);
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS errors_fts USING fts5(error, fix, content_rowid='id', tokenize='porter')`);
  db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS loa_fts USING fts5(title, fabric_extract, content_rowid='id', tokenize='porter')`);

  db.close();
  console.log(`Database initialized at ${DB_PATH}`);
}

// ─── Embedding helpers ─────────────────────────────────────────────

const SPARK_OLLAMA = 'http://100.65.31.93:11434';
const EMBED_MODEL = 'nomic-embed-text';

async function embedQuery(text: string): Promise<Float32Array | null> {
  const input = text.length > 8000 ? text.slice(0, 8000) : text;
  try {
    const resp = await fetch(`${SPARK_OLLAMA}/api/embeddings`, {
      method: 'POST',
      body: JSON.stringify({ model: EMBED_MODEL, prompt: input }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    if (!data.embedding || data.embedding.length === 0) return null;
    return new Float32Array(data.embedding);
  } catch { return null; }
}

function blobToEmbedding(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Search (hybrid: FTS5 + vector) ───────────────────────────────

async function searchAsync(query: string, limit: number = 10): Promise<void> {
  const db = getDb();
  const results: Array<{ source: string; id: number; snippet: string; score: number }> = [];

  // 1. FTS5 keyword search
  const tables = [
    { fts: 'loa_fts', base: 'loa_entries', label: 'loa' },
    { fts: 'messages_fts', base: 'messages', label: 'msg' },
    { fts: 'decisions_fts', base: 'decisions', label: 'dec' },
    { fts: 'learnings_fts', base: 'learnings', label: 'lrn' },
    { fts: 'errors_fts', base: 'errors', label: 'err' },
  ];

  for (const t of tables) {
    try {
      const rows = db.prepare(
        `SELECT ${t.base}.id, snippet(${t.fts}, 0, '>>>', '<<<', '...', 40) as snip, rank
         FROM ${t.fts}
         JOIN ${t.base} ON ${t.base}.id = ${t.fts}.rowid
         WHERE ${t.fts} MATCH ?
         ORDER BY rank
         LIMIT ?`
      ).all(query, limit * 2) as any[];

      for (const row of rows) {
        // Normalize FTS5 rank to 0-1 score (rank is negative, more negative = better)
        const ftsScore = Math.min(1, Math.abs(row.rank) / 20);
        results.push({ source: t.label, id: row.id, snippet: row.snip, score: ftsScore });
      }
    } catch {}
  }

  // 2. Vector search (if embeddings exist and spark is reachable)
  const embCount = (db.prepare('SELECT COUNT(*) as cnt FROM embeddings').get() as any)?.cnt || 0;
  if (embCount > 0) {
    const queryEmb = await embedQuery(query);
    if (queryEmb) {
      // Search across all embedded content
      const embRows = db.prepare(
        `SELECT source_table, source_id, embedding FROM embeddings`
      ).all() as any[];

      const vectorResults: Array<{ source: string; id: number; similarity: number }> = [];
      for (const row of embRows) {
        const emb = blobToEmbedding(row.embedding);
        const sim = cosineSimilarity(queryEmb, emb);
        if (sim > 0.3) { // Threshold
          const label = row.source_table === 'messages' ? 'msg'
            : row.source_table === 'loa_entries' ? 'loa'
            : row.source_table === 'decisions' ? 'dec'
            : row.source_table === 'learnings' ? 'lrn'
            : row.source_table === 'errors' ? 'err' : row.source_table;
          vectorResults.push({ source: label, id: row.source_id, similarity: sim });
        }
      }

      // Sort by similarity, take top N
      vectorResults.sort((a, b) => b.similarity - a.similarity);
      for (const vr of vectorResults.slice(0, limit * 2)) {
        // Check if already in FTS results
        const existing = results.find(r => r.source === vr.source && r.id === vr.id);
        if (existing) {
          // Boost: found by both FTS and vector
          existing.score += vr.similarity;
        } else {
          // Get snippet for vector-only results
          let snippet = '';
          try {
            if (vr.source === 'msg') {
              const row = db.prepare('SELECT content FROM messages WHERE id = ?').get(vr.id) as any;
              snippet = row?.content?.slice(0, 120) || '';
            } else if (vr.source === 'loa') {
              const row = db.prepare('SELECT title FROM loa_entries WHERE id = ?').get(vr.id) as any;
              snippet = row?.title || '';
            } else if (vr.source === 'dec') {
              const row = db.prepare('SELECT decision FROM decisions WHERE id = ?').get(vr.id) as any;
              snippet = row?.decision || '';
            } else if (vr.source === 'lrn') {
              const row = db.prepare('SELECT problem FROM learnings WHERE id = ?').get(vr.id) as any;
              snippet = row?.problem || '';
            } else if (vr.source === 'err') {
              const row = db.prepare('SELECT error, fix FROM errors WHERE id = ?').get(vr.id) as any;
              snippet = `${row?.error} → ${row?.fix}` || '';
            }
          } catch {}
          results.push({ source: vr.source, id: vr.id, snippet: `[semantic] ${snippet}`, score: vr.similarity });
        }
      }
    }
  }

  // Rank fusion: sort by combined score
  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, limit);

  if (top.length === 0) {
    console.log(`No results for "${query}"`);
    db.close();
    return;
  }

  console.log(`\n${top.length} results for "${query}"${embCount > 0 ? ' (hybrid: keyword + semantic)' : ' (keyword only)'}:\n`);
  for (const r of top) {
    const tag = `[${r.source}:${r.id}]`.padEnd(10);
    const scoreStr = r.score.toFixed(2).padStart(5);
    console.log(`  ${tag} (${scoreStr}) ${r.snippet}`);
  }
  console.log('');
  db.close();
}

// Sync wrapper for CLI
function search(query: string, limit: number = 10): void {
  // Run async search synchronously for CLI
  const promise = searchAsync(query, limit);
  // Bun supports top-level await implicitly via the event loop
}

// ─── Recent ────────────────────────────────────────────────────────

function recent(table: string = 'all', limit: number = 5): void {
  const db = getDb();

  const tables: Record<string, { query: string; format: (r: any) => string }> = {
    decisions: {
      query: `SELECT id, created_at, project, decision FROM decisions ORDER BY created_at DESC LIMIT ?`,
      format: (r: any) => `  [${r.created_at}] ${r.project || '-'}: ${r.decision?.slice(0, 100)}`,
    },
    learnings: {
      query: `SELECT id, created_at, project, problem, solution FROM learnings ORDER BY created_at DESC LIMIT ?`,
      format: (r: any) => `  [${r.created_at}] ${r.problem?.slice(0, 60)} → ${r.solution?.slice(0, 60)}`,
    },
    errors: {
      query: `SELECT id, created_at, error, fix, frequency FROM errors ORDER BY last_seen DESC LIMIT ?`,
      format: (r: any) => `  [${r.created_at}] (${r.frequency}x) ${r.error?.slice(0, 50)} → ${r.fix?.slice(0, 50)}`,
    },
    loa: {
      query: `SELECT id, created_at, title, project FROM loa_entries ORDER BY created_at DESC LIMIT ?`,
      format: (r: any) => `  [${r.created_at}] ${r.project || '-'}: ${r.title?.slice(0, 80)}`,
    },
    sessions: {
      query: `SELECT id, started_at, project, summary FROM sessions ORDER BY started_at DESC LIMIT ?`,
      format: (r: any) => `  [${r.started_at}] ${r.project || '-'}: ${r.summary?.slice(0, 80) || '(no summary)'}`,
    },
  };

  const toShow = table === 'all' ? Object.keys(tables) : [table];

  for (const t of toShow) {
    if (!tables[t]) {
      console.error(`Unknown table: ${t}. Options: ${Object.keys(tables).join(', ')}, all`);
      process.exit(1);
    }
    const rows = db.prepare(tables[t].query).all(limit) as any[];
    console.log(`\n${t} (${rows.length}):`);
    if (rows.length === 0) { console.log('  (empty)'); continue; }
    for (const r of rows) { console.log(tables[t].format(r)); }
  }
  console.log('');
  db.close();
}

// ─── Stats ─────────────────────────────────────────────────────────

function stats(): void {
  const db = getDb();
  const tables = ['sessions', 'messages', 'decisions', 'learnings', 'errors', 'loa_entries'];

  console.log(`\nDatabase: ${DB_PATH}`);
  try {
    const size = statSync(DB_PATH).size;
    console.log(`Size: ${(size / 1024 / 1024).toFixed(1)} MB\n`);
  } catch { console.log(''); }

  for (const t of tables) {
    try {
      const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${t}`).get() as any;
      console.log(`  ${t.padEnd(15)} ${row.cnt}`);
    } catch {
      console.log(`  ${t.padEnd(15)} (not initialized)`);
    }
  }
  console.log('');
  db.close();
}

// ─── Add ───────────────────────────────────────────────────────────

function addDecision(text: string, project?: string): void {
  const db = getDb();
  const parts = text.split(':');
  const decision = parts[0].trim();
  const reasoning = parts.length > 1 ? parts.slice(1).join(':').trim() : null;

  const result = db.prepare(
    `INSERT INTO decisions (project, decision, reasoning) VALUES (?, ?, ?)`
  ).run(project || null, decision, reasoning);

  // NOTE: trigger handles FTS sync automatically

  console.log(`Decision added (id: ${result.lastInsertRowid})`);
  db.close();
}

function addLearning(text: string, project?: string): void {
  const db = getDb();
  const parts = text.split('→');
  const problem = parts[0].trim();
  const solution = parts.length > 1 ? parts.slice(1).join('→').trim() : null;

  const result = db.prepare(
    `INSERT INTO learnings (project, problem, solution) VALUES (?, ?, ?)`
  ).run(project || null, problem, solution);

  // NOTE: trigger handles FTS sync automatically

  console.log(`Learning added (id: ${result.lastInsertRowid})`);
  db.close();
}

// ─── Import ────────────────────────────────────────────────────────

function importSessions(limit?: number): void {
  const db = getDb();
  if (!existsSync(PROJECTS_DIR)) {
    console.error('No projects directory found');
    process.exit(1);
  }

  let totalMessages = 0;
  let totalSessions = 0;

  for (const projDir of readdirSync(PROJECTS_DIR)) {
    const projPath = join(PROJECTS_DIR, projDir);
    if (!statSync(projPath).isDirectory()) continue;

    const cwd = '/' + projDir.replace(/^-/, '').replace(/-/g, '/');
    const project = cwd.split('/').pop() || projDir;

    const files = readdirSync(projPath)
      .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
      .sort();

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      const filePath = join(projPath, file);

      // Skip if session already imported
      const existing = db.prepare('SELECT id FROM sessions WHERE session_id = ?').get(sessionId) as any;
      if (existing) continue;

      // Create session
      const fstat = statSync(filePath);
      db.prepare(
        `INSERT INTO sessions (session_id, started_at, project, cwd) VALUES (?, ?, ?, ?)`
      ).run(sessionId, fstat.birthtime.toISOString(), project, cwd);

      // Parse messages
      const content = readFileSync(filePath, 'utf-8');
      let msgCount = 0;
      const insertMsg = db.prepare(
        `INSERT INTO messages (session_id, timestamp, role, content, project) VALUES (?, ?, ?, ?, ?)`
      );

      const tx = db.transaction(() => {
        for (const line of content.trim().split('\n')) {
          try {
            const entry = JSON.parse(line);
            if (!entry.message?.content) continue;
            const role = entry.message.role;
            if (role !== 'user' && role !== 'assistant') continue;

            let text = '';
            if (typeof entry.message.content === 'string') {
              text = entry.message.content;
            } else if (Array.isArray(entry.message.content)) {
              text = entry.message.content
                .filter((b: any) => b.type === 'text' && b.text)
                .map((b: any) => b.text)
                .join('\n');
            }

            if (text.length < 10) continue;
            // Truncate very long messages to keep DB reasonable
            if (text.length > 5000) text = text.slice(0, 5000);

            const ts = entry.timestamp || fstat.birthtime.toISOString();
            insertMsg.run(sessionId, typeof ts === 'number' ? new Date(ts).toISOString() : ts, role, text, project);
            msgCount++;
          } catch { continue; }
        }
      });

      tx();
      totalMessages += msgCount;
      totalSessions++;

      if (limit && totalSessions >= limit) break;
    }
    if (limit && totalSessions >= limit) break;
  }

  // Rebuild FTS index for messages
  if (totalMessages > 0) {
    console.log('Building FTS index...');
    db.run('DELETE FROM messages_fts');
    db.run(`INSERT INTO messages_fts (rowid, content) SELECT id, content FROM messages`);
  }

  console.log(`Imported ${totalSessions} sessions, ${totalMessages} messages`);
  db.close();
}

function importLegacy(): void {
  const distilledPath = join(MEMORY_DIR, 'DISTILLED.md');
  if (!existsSync(distilledPath)) {
    console.error('No DISTILLED.md found');
    process.exit(1);
  }

  const db = getDb();
  const content = readFileSync(distilledPath, 'utf-8');

  // Parse sections separated by --- ## Extracted:
  const sections = content.split(/\n---\n## Extracted:\s*/);
  let imported = 0;

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const headerMatch = section.match(/^(\S+)\s*\|\s*(\S+)/);
    if (!headerMatch) continue;

    const date = headerMatch[1];
    const project = headerMatch[2];
    const body = section.slice(section.indexOf('\n') + 1).trim();

    // Extract title from ONE SENTENCE SUMMARY
    const titleMatch = body.match(/##\s*ONE\s*SENTENCE\s*SUMMARY\s*\n+(.+)/);
    const title = titleMatch ? titleMatch[1].trim().slice(0, 200) : `${project} session ${date}`;

    // Check for duplicate
    const existing = db.prepare(
      'SELECT id FROM loa_entries WHERE title = ? AND project = ?'
    ).get(title, project) as any;
    if (existing) continue;

    const result = db.prepare(
      `INSERT INTO loa_entries (created_at, title, fabric_extract, project) VALUES (?, ?, ?, ?)`
    ).run(date, title, body, project);

    // NOTE: trigger handles FTS sync automatically

    // Also extract decisions from the body
    const decisionsMatch = body.match(/##\s*DECISIONS\s*MADE\s*([\s\S]*?)(?=\n##\s|$)/);
    if (decisionsMatch) {
      const lines = decisionsMatch[1].split('\n')
        .filter(l => l.trim().startsWith('-'))
        .map(l => l.replace(/^-\s*/, '').replace(/\*\*/g, '').trim())
        .filter(l => l.length > 5);

      for (const line of lines) {
        const parts = line.split(':');
        const decision = parts[0].trim();
        const reasoning = parts.length > 1 ? parts.slice(1).join(':').trim() : null;

        const r = db.prepare(
          `INSERT INTO decisions (created_at, project, decision, reasoning) VALUES (?, ?, ?, ?)`
        ).run(date, project, decision, reasoning);

        // NOTE: trigger handles FTS sync
      }
    }

    // Extract errors from the body
    const errorsMatch = body.match(/##\s*ERRORS?\s*FIXED\s*([\s\S]*?)(?=\n##\s|$)/);
    if (errorsMatch) {
      const lines = errorsMatch[1].split('\n')
        .filter(l => l.trim().startsWith('-'))
        .map(l => l.replace(/^-\s*/, '').replace(/\*\*/g, '').trim())
        .filter(l => l.includes(':'));

      for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0) {
          const error = line.slice(0, colonIdx).trim();
          const fix = line.slice(colonIdx + 1).trim();

          const r = db.prepare(
            `INSERT INTO errors (created_at, error, fix) VALUES (?, ?, ?)`
          ).run(date, error, fix);

          // NOTE: trigger handles FTS sync
        }
      }
    }

    imported++;
  }

  console.log(`Imported ${imported} LoA entries from DISTILLED.md`);
  db.close();
}

// ─── Dump (LoA capture) ────────────────────────────────────────────

function dump(title: string): void {
  const db = getDb();

  // Find the most recent conversation JSONL
  if (!existsSync(PROJECTS_DIR)) {
    console.error('No projects directory found');
    process.exit(1);
  }

  let newestFile = '';
  let newestMtime = 0;
  let newestCwd = '';

  for (const projDir of readdirSync(PROJECTS_DIR)) {
    const projPath = join(PROJECTS_DIR, projDir);
    try {
      if (!statSync(projPath).isDirectory()) continue;
      const cwd = '/' + projDir.replace(/^-/, '').replace(/-/g, '/');
      for (const f of readdirSync(projPath)) {
        if (!f.endsWith('.jsonl') || f.startsWith('agent-')) continue;
        const fpath = join(projPath, f);
        const mt = statSync(fpath).mtimeMs;
        if (mt > newestMtime) {
          newestMtime = mt;
          newestFile = fpath;
          newestCwd = cwd;
        }
      }
    } catch { continue; }
  }

  if (!newestFile) {
    console.error('No conversation files found');
    process.exit(1);
  }

  const sessionId = basename(newestFile).replace('.jsonl', '');
  const project = newestCwd.split('/').pop() || 'unknown';

  console.log(`Capturing session: ${basename(newestFile)}`);
  console.log(`Project: ${project}`);
  console.log(`Title: ${title}`);

  // Extract messages from the conversation
  const content = readFileSync(newestFile, 'utf-8');
  const messages: string[] = [];

  for (const line of content.trim().split('\n')) {
    try {
      const entry = JSON.parse(line);
      if (!entry.message?.content) continue;
      const role = entry.message.role;
      if (role !== 'user' && role !== 'assistant') continue;

      let text = '';
      if (typeof entry.message.content === 'string') {
        text = entry.message.content;
      } else if (Array.isArray(entry.message.content)) {
        text = entry.message.content
          .filter((b: any) => b.type === 'text' && b.text)
          .map((b: any) => b.text)
          .join('\n');
      }
      if (text.length < 10) continue;
      if (text.length > 4000) text = text.slice(0, 4000) + '...[truncated]';
      messages.push(`[${role.toUpperCase()}]: ${text}`);
    } catch { continue; }
  }

  if (messages.length === 0) {
    console.error('No messages found in conversation');
    process.exit(1);
  }

  console.log(`Messages: ${messages.length}`);
  console.log('Extracting via Inference.ts...');

  // Get extraction prompt
  const extractPromptPath = join(MEMORY_DIR, 'extract_prompt.md');
  let systemPrompt = 'Extract key information from this AI session transcript. Use sections: ONE SENTENCE SUMMARY, MAIN IDEAS, DECISIONS MADE, ERRORS FIXED, CONTEXT.';
  try {
    if (existsSync(extractPromptPath)) {
      systemPrompt = readFileSync(extractPromptPath, 'utf-8').trim();
    }
  } catch {}

  // Truncate messages to fit
  const truncated = messages.join('\n\n').slice(-60000);

  // Call Inference.ts for extraction
  const { execSync } = require('child_process');
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDECODE;

  let fabricExtract: string;
  try {
    fabricExtract = execSync(
      `claude --print --model haiku --tools '' --output-format text --setting-sources '' --system-prompt "${systemPrompt.replace(/"/g, '\\"').slice(0, 800)}"`,
      {
        input: `Extract the key information from this session titled "${title}":\n\n${truncated}`,
        encoding: 'utf-8',
        timeout: 90000,
        maxBuffer: 10 * 1024 * 1024,
        env,
      }
    ).trim();
  } catch (err: any) {
    console.error(`Extraction failed: ${err.message}`);
    // Fallback: use the title as the extract
    fabricExtract = `## ONE SENTENCE SUMMARY\n${title}\n\n## MAIN IDEAS\n- Session captured manually\n\n## CONTEXT\nManual /dump capture`;
  }

  // Quality gate
  if (fabricExtract.length < 50) {
    console.error('Extraction too short, using fallback');
    fabricExtract = `## ONE SENTENCE SUMMARY\n${title}\n\n## MAIN IDEAS\n- Session captured manually\n\n## CONTEXT\nManual /dump capture`;
  }

  // Write LoA entry to database
  const result = db.prepare(
    `INSERT INTO loa_entries (title, fabric_extract, session_id, project) VALUES (?, ?, ?, ?)`
  ).run(title, fabricExtract, sessionId, project);

  // NOTE: trigger handles FTS sync automatically

  // Also extract decisions and errors into their tables
  const decisionsMatch = fabricExtract.match(/(?:##\s*DECISIONS\s*MADE|DECISIONS:)\s*([\s\S]*?)(?=\n##\s|$)/);
  if (decisionsMatch) {
    const lines = decisionsMatch[1].split('\n')
      .filter((l: string) => l.trim().startsWith('-'))
      .map((l: string) => l.replace(/^-\s*/, '').replace(/\*\*/g, '').trim())
      .filter((l: string) => l.length > 5);

    for (const line of lines) {
      const parts = line.split(':');
      const decision = parts[0].trim();
      const reasoning = parts.length > 1 ? parts.slice(1).join(':').trim() : null;
      const r = db.prepare(
        `INSERT INTO decisions (session_id, project, decision, reasoning) VALUES (?, ?, ?, ?)`
      ).run(sessionId, project, decision, reasoning);
      // NOTE: trigger handles FTS sync
    }
  }

  const errorsMatch = fabricExtract.match(/(?:##\s*ERRORS?\s*FIXED|ERRORS_FIXED:)\s*([\s\S]*?)(?=\n##\s|$)/);
  if (errorsMatch) {
    const lines = errorsMatch[1].split('\n')
      .filter((l: string) => l.trim().startsWith('-'))
      .map((l: string) => l.replace(/^-\s*/, '').replace(/\*\*/g, '').trim())
      .filter((l: string) => l.includes(':'));

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const error = line.slice(0, colonIdx).trim();
        const fix = line.slice(colonIdx + 1).trim();
        const existing = db.prepare('SELECT id, frequency FROM errors WHERE error = ?').get(error) as any;
        if (existing) {
          db.prepare('UPDATE errors SET frequency = frequency + 1, last_seen = CURRENT_TIMESTAMP, fix = ? WHERE id = ?')
            .run(fix, existing.id);
        } else {
          db.prepare('INSERT INTO errors (error, fix) VALUES (?, ?)').run(error, fix);
          // NOTE: trigger handles FTS sync
        }
      }
    }
  }

  // Also append to DISTILLED.md flat file for grep compatibility
  const distilledPath = join(MEMORY_DIR, 'DISTILLED.md');
  const { appendFileSync } = require('fs');
  const timestamp = new Date().toISOString().split('T')[0];
  appendFileSync(distilledPath, `\n---\n## Extracted: ${timestamp} | ${project}\n\n${fabricExtract}\n`, 'utf-8');

  console.log(`\nLoA #${result.lastInsertRowid} captured: "${title}"`);
  console.log(`Fabric extract: ${fabricExtract.length} chars`);

  db.close();
}

// ─── CLI ───────────────────────────────────────────────────────────

function usage(): void {
  console.log(`
mem — Memory CLI for Claude Code

Commands:
  mem init                      Initialize database
  mem search <query>            FTS5 search across all tables
  mem recent [table] [-n N]     Recent entries (decisions, learnings, errors, loa, sessions, all)
  mem stats                     Database statistics
  mem add decision <text>       Add a decision (use "decision: reasoning" format)
  mem add learning <text>       Add a learning (use "problem → solution" format)
  mem dump "Title"              Capture current session as LoA entry (used by /dump)
  mem import                    Import conversation JSONL files
  mem import-legacy             Import DISTILLED.md into database

Options:
  -n, --limit <N>               Max results (default: 10 for search, 5 for recent)
  -p, --project <name>          Filter by project
  -h, --help                    Show this help
`);
}

// Parse args
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
  usage();
  process.exit(0);
}

const cmd = args[0];

// Parse options
let limit = cmd === 'search' ? 10 : 5;
let project: string | undefined;
for (let i = 1; i < args.length; i++) {
  if ((args[i] === '-n' || args[i] === '--limit') && args[i + 1]) {
    limit = parseInt(args[i + 1], 10);
    args.splice(i, 2);
    i--;
  } else if ((args[i] === '-p' || args[i] === '--project') && args[i + 1]) {
    project = args[i + 1];
    args.splice(i, 2);
    i--;
  }
}

(async () => {
switch (cmd) {
  case 'init':
    initDb();
    break;

  case 'search':
    if (args.length < 2) { console.error('Usage: mem search <query>'); process.exit(1); }
    await searchAsync(args.slice(1).join(' '), limit);
    break;

  case 'recent':
    recent(args[1] || 'all', limit);
    break;

  case 'stats':
    stats();
    break;

  case 'add':
    if (args[1] === 'decision' && args.length > 2) {
      addDecision(args.slice(2).join(' '), project);
    } else if (args[1] === 'learning' && args.length > 2) {
      addLearning(args.slice(2).join(' '), project);
    } else {
      console.error('Usage: mem add decision <text> | mem add learning <text>');
      process.exit(1);
    }
    break;

  case 'import':
    importSessions(limit !== 5 ? limit : undefined);
    break;

  case 'import-legacy':
    importLegacy();
    break;

  case 'dump':
    if (args.length < 2) { console.error('Usage: mem dump "Title of this session"'); process.exit(1); }
    dump(args.slice(1).join(' '));
    break;

  default:
    // If no command matches, treat as search
    await searchAsync(args.join(' '), limit);
    break;
}
})();
