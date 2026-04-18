// Core memory operations for LMF

import { getDb, getDbPath } from '../db/connection.js';
import { existsSync, statSync } from 'fs';
import type { Session, Message, Decision, Learning, Breadcrumb, LoaEntry, Stats, SearchResult } from '../types/index.js';

// ============ Sessions ============

export function createSession(session: Omit<Session, 'id'>): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO sessions (session_id, started_at, ended_at, summary, project, cwd, git_branch, model)
    VALUES ($session_id, $started_at, $ended_at, $summary, $project, $cwd, $git_branch, $model)
  `);
  const result = stmt.run({
    $session_id: session.session_id,
    $started_at: session.started_at,
    $ended_at: session.ended_at || null,
    $summary: session.summary || null,
    $project: session.project || null,
    $cwd: session.cwd || null,
    $git_branch: session.git_branch || null,
    $model: session.model || null
  });
  return result.lastInsertRowid as number;
}

export function getSession(sessionId: string): Session | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as Session | undefined;
}

export function sessionExists(sessionId: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM sessions WHERE session_id = ?').get(sessionId);
  return !!row;
}

export function endSession(sessionId: string, summary?: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET ended_at = CURRENT_TIMESTAMP, summary = COALESCE(?, summary) WHERE session_id = ?')
    .run(summary || null, sessionId);
}

// ============ Messages ============

export function addMessage(message: Omit<Message, 'id'>): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO messages (session_id, timestamp, role, content, project)
    VALUES ($session_id, $timestamp, $role, $content, $project)
  `);
  const result = stmt.run({
    $session_id: message.session_id,
    $timestamp: message.timestamp,
    $role: message.role,
    $content: message.content,
    $project: message.project || null
  });
  return result.lastInsertRowid as number;
}

export function addMessagesBatch(messages: Omit<Message, 'id'>[]): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO messages (session_id, timestamp, role, content, project)
    VALUES ($session_id, $timestamp, $role, $content, $project)
  `);

  const insertMany = db.transaction((msgs: Omit<Message, 'id'>[]) => {
    let count = 0;
    for (const msg of msgs) {
      stmt.run({
        $session_id: msg.session_id,
        $timestamp: msg.timestamp,
        $role: msg.role,
        $content: msg.content,
        $project: msg.project || null
      });
      count++;
    }
    return count;
  });

  return insertMany(messages);
}

// ============ Decisions ============

export function addDecision(decision: Omit<Decision, 'id' | 'created_at'>): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO decisions (session_id, category, project, decision, reasoning, alternatives, status)
    VALUES ($session_id, $category, $project, $decision, $reasoning, $alternatives, $status)
  `);
  const result = stmt.run({
    $session_id: decision.session_id || null,
    $category: decision.category || null,
    $project: decision.project || null,
    $decision: decision.decision,
    $reasoning: decision.reasoning || null,
    $alternatives: decision.alternatives || null,
    $status: decision.status || 'active'
  });
  return result.lastInsertRowid as number;
}

export function getDecision(id: number): Decision | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as Decision | undefined;
}

// ============ Learnings ============

export function addLearning(learning: Omit<Learning, 'id' | 'created_at'>): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO learnings (session_id, category, project, problem, solution, prevention, tags)
    VALUES ($session_id, $category, $project, $problem, $solution, $prevention, $tags)
  `);
  const result = stmt.run({
    $session_id: learning.session_id || null,
    $category: learning.category || null,
    $project: learning.project || null,
    $problem: learning.problem,
    $solution: learning.solution || null,
    $prevention: learning.prevention || null,
    $tags: learning.tags || null
  });
  return result.lastInsertRowid as number;
}

export function getLearning(id: number): Learning | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM learnings WHERE id = ?').get(id) as Learning | undefined;
}

// ============ Breadcrumbs ============

export function addBreadcrumb(breadcrumb: Omit<Breadcrumb, 'id' | 'created_at'>): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO breadcrumbs (session_id, content, category, project, importance, expires_at)
    VALUES ($session_id, $content, $category, $project, $importance, $expires_at)
  `);
  const result = stmt.run({
    $session_id: breadcrumb.session_id || null,
    $content: breadcrumb.content,
    $category: breadcrumb.category || null,
    $project: breadcrumb.project || null,
    $importance: breadcrumb.importance ?? 5,
    $expires_at: breadcrumb.expires_at || null
  });
  return result.lastInsertRowid as number;
}

export function getBreadcrumb(id: number): Breadcrumb | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM breadcrumbs WHERE id = ?').get(id) as Breadcrumb | undefined;
}

// ============ Search ============

// Track search errors for debugging (FIX #7)
let lastSearchErrors: string[] = [];

export function getLastSearchErrors(): string[] {
  return lastSearchErrors;
}

export function search(query: string, options?: { project?: string; table?: string; limit?: number }): SearchResult[] {
  const db = getDb();
  const limit = options?.limit || 20;
  const results: SearchResult[] = [];
  lastSearchErrors = []; // Reset errors for this search

  const tables = options?.table
    ? [options.table]
    : ['messages', 'loa', 'decisions', 'learnings', 'breadcrumbs'];

  for (const table of tables) {
    let sql: string;
    const params: (string | number)[] = [query];

    switch (table) {
      case 'messages':
        sql = `
          SELECT m.id, m.content, m.project, m.timestamp as created_at, f.rank
          FROM messages_fts f
          JOIN messages m ON m.id = f.rowid
          WHERE messages_fts MATCH ?
          ${options?.project ? 'AND m.project = ?' : ''}
          ORDER BY f.rank
          LIMIT ?
        `;
        break;
      case 'decisions':
        sql = `
          SELECT d.id, d.decision as content, d.project, d.created_at, f.rank
          FROM decisions_fts f
          JOIN decisions d ON d.id = f.rowid
          WHERE decisions_fts MATCH ?
          ${options?.project ? 'AND d.project = ?' : ''}
          ORDER BY f.rank
          LIMIT ?
        `;
        break;
      case 'learnings':
        sql = `
          SELECT l.id, l.problem as content, l.project, l.created_at, f.rank
          FROM learnings_fts f
          JOIN learnings l ON l.id = f.rowid
          WHERE learnings_fts MATCH ?
          ${options?.project ? 'AND l.project = ?' : ''}
          ORDER BY f.rank
          LIMIT ?
        `;
        break;
      case 'breadcrumbs':
        sql = `
          SELECT b.id, b.content, b.project, b.created_at, f.rank
          FROM breadcrumbs_fts f
          JOIN breadcrumbs b ON b.id = f.rowid
          WHERE breadcrumbs_fts MATCH ?
          ${options?.project ? 'AND b.project = ?' : ''}
          ORDER BY f.rank
          LIMIT ?
        `;
        break;
      case 'loa':
        sql = `
          SELECT l.id, l.title || ': ' || SUBSTR(l.fabric_extract, 1, 200) as content, l.project, l.created_at, f.rank
          FROM loa_fts f
          JOIN loa_entries l ON l.id = f.rowid
          WHERE loa_fts MATCH ?
          ${options?.project ? 'AND l.project = ?' : ''}
          ORDER BY f.rank
          LIMIT ?
        `;
        break;
      default:
        continue;
    }

    if (options?.project) {
      params.push(options.project);
    }
    params.push(limit);

    try {
      const rows = db.prepare(sql).all(...params) as Array<{
        id: number;
        content: string;
        project: string | null;
        created_at: string;
        rank: number;
      }>;

      for (const row of rows) {
        results.push({
          table,
          id: row.id,
          content: row.content,
          project: row.project || undefined,
          created_at: row.created_at,
          rank: row.rank
        });
      }
    } catch (err) {
      // FIX #7: Record errors instead of silently swallowing
      const errorMsg = err instanceof Error ? err.message : String(err);
      lastSearchErrors.push(`[${table}] ${errorMsg}`);
      // Continue searching other tables even if one fails
    }
  }

  // Sort all results by rank
  results.sort((a, b) => (a.rank || 0) - (b.rank || 0));

  return results.slice(0, limit);
}

// ============ Recent ============

export function recentMessages(limit: number = 10, project?: string): Message[] {
  const db = getDb();
  const sql = project
    ? 'SELECT * FROM messages WHERE project = ? ORDER BY timestamp DESC LIMIT ?'
    : 'SELECT * FROM messages ORDER BY timestamp DESC LIMIT ?';
  const params = project ? [project, limit] : [limit];
  return db.prepare(sql).all(...params) as Message[];
}

export function recentDecisions(limit: number = 10, project?: string): Decision[] {
  const db = getDb();
  const sql = project
    ? 'SELECT * FROM decisions WHERE project = ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM decisions ORDER BY created_at DESC LIMIT ?';
  const params = project ? [project, limit] : [limit];
  return db.prepare(sql).all(...params) as Decision[];
}

export function recentLearnings(limit: number = 10, project?: string): Learning[] {
  const db = getDb();
  const sql = project
    ? 'SELECT * FROM learnings WHERE project = ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM learnings ORDER BY created_at DESC LIMIT ?';
  const params = project ? [project, limit] : [limit];
  return db.prepare(sql).all(...params) as Learning[];
}

export function recentBreadcrumbs(limit: number = 10, project?: string): Breadcrumb[] {
  const db = getDb();
  const sql = project
    ? 'SELECT * FROM breadcrumbs WHERE project = ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM breadcrumbs ORDER BY created_at DESC LIMIT ?';
  const params = project ? [project, limit] : [limit];
  return db.prepare(sql).all(...params) as Breadcrumb[];
}

// ============ Library of Alexandria ============

export function createLoaEntry(entry: Omit<LoaEntry, 'id' | 'created_at'>): number {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO loa_entries (title, description, fabric_extract, message_range_start, message_range_end, parent_loa_id, session_id, project, tags, message_count)
    VALUES ($title, $description, $fabric_extract, $message_range_start, $message_range_end, $parent_loa_id, $session_id, $project, $tags, $message_count)
  `);
  const result = stmt.run({
    $title: entry.title,
    $description: entry.description || null,
    $fabric_extract: entry.fabric_extract,
    $message_range_start: entry.message_range_start || null,
    $message_range_end: entry.message_range_end || null,
    $parent_loa_id: entry.parent_loa_id || null,
    $session_id: entry.session_id || null,
    $project: entry.project || null,
    $tags: entry.tags || null,
    $message_count: entry.message_count || null
  });
  return result.lastInsertRowid as number;
}

export function getLoaEntry(id: number): LoaEntry | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM loa_entries WHERE id = ?').get(id) as LoaEntry | undefined;
}

export function getLastLoaEntry(): LoaEntry | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM loa_entries ORDER BY created_at DESC LIMIT 1').get() as LoaEntry | undefined;
}

export function getLoaMessages(loaId: number): Message[] {
  const db = getDb();
  const loa = getLoaEntry(loaId);
  if (!loa || !loa.message_range_start || !loa.message_range_end) {
    return [];
  }
  return db.prepare('SELECT * FROM messages WHERE id >= ? AND id <= ? ORDER BY timestamp')
    .all(loa.message_range_start, loa.message_range_end) as Message[];
}

export function getMessagesSinceLastLoa(limit?: number): { messages: Message[]; startId: number | null; endId: number | null } {
  const db = getDb();
  const lastLoa = getLastLoaEntry();

  let sql: string;
  let params: (number | undefined)[];

  if (lastLoa?.message_range_end) {
    sql = limit
      ? 'SELECT * FROM messages WHERE id > ? ORDER BY timestamp LIMIT ?'
      : 'SELECT * FROM messages WHERE id > ? ORDER BY timestamp';
    params = limit ? [lastLoa.message_range_end, limit] : [lastLoa.message_range_end];
  } else {
    sql = limit
      ? 'SELECT * FROM messages ORDER BY timestamp LIMIT ?'
      : 'SELECT * FROM messages ORDER BY timestamp';
    params = limit ? [limit] : [];
  }

  const messages = db.prepare(sql).all(...params) as Message[];

  return {
    messages,
    startId: messages.length > 0 ? messages[0].id! : null,
    endId: messages.length > 0 ? messages[messages.length - 1].id! : null
  };
}

export function recentLoaEntries(limit: number = 10, project?: string): LoaEntry[] {
  const db = getDb();
  const sql = project
    ? 'SELECT * FROM loa_entries WHERE project = ? ORDER BY created_at DESC LIMIT ?'
    : 'SELECT * FROM loa_entries ORDER BY created_at DESC LIMIT ?';
  const params = project ? [project, limit] : [limit];
  return db.prepare(sql).all(...params) as LoaEntry[];
}

// ============ Stats ============

export function getStats(): Stats {
  const db = getDb();

  const sessions = (db.prepare('SELECT COUNT(*) as count FROM sessions').get() as { count: number }).count;
  const messages = (db.prepare('SELECT COUNT(*) as count FROM messages').get() as { count: number }).count;
  const decisions = (db.prepare('SELECT COUNT(*) as count FROM decisions').get() as { count: number }).count;
  const learnings = (db.prepare('SELECT COUNT(*) as count FROM learnings').get() as { count: number }).count;
  const breadcrumbs = (db.prepare('SELECT COUNT(*) as count FROM breadcrumbs').get() as { count: number }).count;
  const loa_entries = (db.prepare('SELECT COUNT(*) as count FROM loa_entries').get() as { count: number }).count;
  const telos = (db.prepare('SELECT COUNT(*) as count FROM telos').get() as { count: number }).count;
  const documents = (db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number }).count;

  // Get DB file size
  const dbPath = getDbPath();
  const db_size_bytes = existsSync(dbPath) ? statSync(dbPath).size : 0;

  return {
    sessions,
    messages,
    decisions,
    learnings,
    breadcrumbs,
    loa_entries,
    telos,
    documents,
    db_size_bytes
  };
}
