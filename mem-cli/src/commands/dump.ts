// mem dump command - Flush current session to DB + capture LoA

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { getDb } from '../db/connection.js';
import { createSession, sessionExists, addMessagesBatch, createLoaEntry, getLastLoaEntry } from '../lib/memory.js';
import { extractProjectFromPath } from '../lib/project.js';
import { embed, embeddingToBlob, checkEmbeddingService } from '../lib/embeddings.js';
import type { Message } from '../types/index.js';

/**
 * Auto-embed a new LoA entry for semantic search (Phase 3)
 */
async function autoEmbedLoaEntry(id: number, title: string, fabricExtract: string): Promise<void> {
  try {
    const serviceStatus = await checkEmbeddingService();
    if (!serviceStatus.available) {
      console.log(`  ⚠ Embedding skipped (service unavailable)`);
      return;
    }

    const content = `${title}\n\n${fabricExtract}`;
    const result = await embed(content);
    const blob = embeddingToBlob(result.embedding);

    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO embeddings (source_table, source_id, model, dimensions, embedding)
      VALUES (?, ?, ?, ?, ?)
    `).run('loa_entries', id, result.model, result.dimensions, blob);

    console.log(`  ✓ Auto-embedded for semantic search (${result.dimensions}d)`);
  } catch (err) {
    console.log(`  ⚠ Embedding failed: ${err instanceof Error ? err.message : err}`);
  }
}

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

interface DumpOptions {
  project?: string;
  continues?: number;
  tags?: string;
  limit?: number;
  skipFabric?: boolean;
}

/**
 * Find the most recently modified JSONL file (likely the current session)
 */
function findCurrentSessionFile(): string | null {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    return null;
  }

  let mostRecentFile: string | null = null;
  let mostRecentTime = 0;

  const projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const projectDir of projectDirs) {
    const projectPath = join(CLAUDE_PROJECTS_DIR, projectDir);

    const jsonlFiles = readdirSync(projectPath, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.endsWith('.jsonl'))
      .map(f => join(projectPath, f.name));

    for (const file of jsonlFiles) {
      const stat = statSync(file);
      if (stat.mtimeMs > mostRecentTime) {
        mostRecentTime = stat.mtimeMs;
        mostRecentFile = file;
      }
    }
  }

  return mostRecentFile;
}

/**
 * Parse a session JSONL file
 */
function parseSessionFile(filePath: string): { sessionId: string; project: string; messages: Omit<Message, 'id'>[] } | null {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length === 0) return null;

  const messages: Omit<Message, 'id'>[] = [];
  let sessionId: string | null = null;
  let project: string | null = null;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);

      // Skip non-message types
      if (parsed.type !== 'user' && parsed.type !== 'assistant') {
        continue;
      }

      // Extract session metadata
      if (!sessionId && parsed.sessionId) {
        sessionId = parsed.sessionId;
      }

      // Extract message content
      if (parsed.message?.content) {
        let msgContent: string;

        if (typeof parsed.message.content === 'string') {
          msgContent = parsed.message.content;
        } else if (Array.isArray(parsed.message.content)) {
          msgContent = parsed.message.content
            .filter((block: any) => block.type === 'text' && block.text)
            .map((block: any) => block.text)
            .join('\n');
        } else {
          continue;
        }

        if (msgContent.trim()) {
          messages.push({
            session_id: parsed.sessionId || sessionId || 'unknown',
            timestamp: parsed.timestamp || new Date().toISOString(),
            role: parsed.type as 'user' | 'assistant',
            content: msgContent,
            project: project || undefined
          });
        }
      }
    } catch {
      continue;
    }
  }

  // Derive project from path
  const projectDir = basename(dirname(filePath));
  project = extractProjectFromPath(projectDir);

  // Update project in all messages
  for (const msg of messages) {
    msg.project = project;
  }

  if (!sessionId) {
    sessionId = basename(filePath, '.jsonl');
  }

  return { sessionId, project, messages };
}

/**
 * Recursively delete LoA entries and their children
 * Prevents FK constraint violations from parent_loa_id references
 */
function deleteLoaEntriesRecursive(db: ReturnType<typeof getDb>, loaIds: number[]): void {
  if (loaIds.length === 0) return;

  // Find all children of these LoA entries
  const childIds = db.prepare(`
    SELECT id FROM loa_entries WHERE parent_loa_id IN (${loaIds.map(() => '?').join(',')})
  `).all(...loaIds) as Array<{ id: number }>;

  // Recursively delete children first
  if (childIds.length > 0) {
    deleteLoaEntriesRecursive(db, childIds.map(c => c.id));
  }

  // Now delete these entries
  db.prepare(`
    DELETE FROM loa_entries WHERE id IN (${loaIds.map(() => '?').join(',')})
  `).run(...loaIds);
}

/**
 * Delete existing session and messages (for re-import)
 * Uses transaction to ensure atomic operation - no partial deletes
 */
function deleteSession(sessionId: string): number {
  const db = getDb();

  // Wrap all deletes in a transaction for atomicity (FIX #3)
  const deleteAll = db.transaction(() => {
    // Count messages to be deleted
    const countResult = db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?').get(sessionId) as { count: number };
    const count = countResult?.count || 0;

    // Get message ID range for this session
    const rangeResult = db.prepare('SELECT MIN(id) as minId, MAX(id) as maxId FROM messages WHERE session_id = ?').get(sessionId) as { minId: number | null; maxId: number | null };

    if (rangeResult && rangeResult.minId !== null && rangeResult.maxId !== null) {
      // Find LoA entries that reference messages in this range
      const affectedLoaIds = db.prepare(`
        SELECT id FROM loa_entries
        WHERE message_range_start >= ? AND message_range_end <= ?
      `).all(rangeResult.minId, rangeResult.maxId) as Array<{ id: number }>;

      // Recursively delete LoA entries and their children (FIX #5)
      if (affectedLoaIds.length > 0) {
        deleteLoaEntriesRecursive(db, affectedLoaIds.map(e => e.id));
      }
    }

    // Delete messages
    db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);

    // Delete session
    db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);

    return count;
  });

  return deleteAll();
}

// Maximum input size for extraction (50MB) — larger sessions should be split.
const MAX_EXTRACT_INPUT_BYTES = 50 * 1024 * 1024;
const EXTRACT_MODEL = process.env.LMF4_EXTRACT_MODEL || 'claude-haiku-4-5';

/**
 * Run extraction on transcript content using `claude --print --model claude-haiku-4-5`.
 * Uses the Claude Code subscription — no API keys, no external dependencies.
 */
function runExtract(content: string): string {
  const inputBytes = Buffer.byteLength(content, 'utf-8');
  if (inputBytes > MAX_EXTRACT_INPUT_BYTES) {
    throw new Error(`Input too large (${(inputBytes / 1024 / 1024).toFixed(1)}MB > 50MB limit). Use --limit to reduce message count.`);
  }

  // Strip ANTHROPIC_API_KEY so the CLI uses the Claude Code subscription,
  // not separate API credits.
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDECODE;

  try {
    const result = execSync(
      `claude --print --model ${EXTRACT_MODEL} --output-format text`,
      {
        input: content,
        encoding: 'utf-8',
        maxBuffer: MAX_EXTRACT_INPUT_BYTES,
        timeout: 600000,
        env,
      }
    );
    return result.trim();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    throw new Error(`Extraction via \`claude --print\` failed: ${error}`);
  }
}

export async function runDump(title: string, options: DumpOptions): Promise<void> {
  console.log('Memory Dump');
  console.log('===========\n');

  // Step 1: Find current session
  const sessionFile = findCurrentSessionFile();

  if (!sessionFile) {
    console.error('Error: No session files found');
    process.exit(1);
  }

  console.log(`Current session: ${basename(sessionFile)}`);
  console.log(`File size: ${(statSync(sessionFile).size / 1024).toFixed(1)} KB\n`);

  // Step 2: Parse the session
  const parsed = parseSessionFile(sessionFile);

  if (!parsed || parsed.messages.length === 0) {
    console.error('Error: No messages found in session file');
    process.exit(1);
  }

  console.log(`Messages found: ${parsed.messages.length}`);
  console.log(`Project: ${parsed.project}`);

  // Step 3: Check if session exists, delete if so (re-import)
  let deletedCount = 0;
  if (sessionExists(parsed.sessionId)) {
    console.log(`\nRe-importing session (replacing ${parsed.sessionId})...`);
    deletedCount = deleteSession(parsed.sessionId);
    console.log(`Deleted ${deletedCount} existing messages`);
  }

  // Step 4: Import the session
  const timestamps = parsed.messages.map(m => m.timestamp).sort();
  const startedAt = timestamps[0];
  const endedAt = timestamps[timestamps.length - 1];

  createSession({
    session_id: parsed.sessionId,
    started_at: startedAt,
    ended_at: endedAt,
    project: parsed.project,
    summary: `Dumped: ${title}`
  });

  const importedCount = addMessagesBatch(parsed.messages);
  console.log(`\n✓ Imported ${importedCount} messages`);

  // Step 5: Run LoA capture (similar to loa.ts logic).
  // `skipFabric` is kept as the option name for back-compat with the LMF3 CLI,
  // but the actual extraction is now via `claude --print`.
  if (options.skipFabric) {
    console.log('\nSkipping extraction (--skip-fabric)');
    return;
  }

  // Get message range for LoA
  const db = getDb();
  const lastLoa = getLastLoaEntry();

  let startId: number;
  let endId: number;
  let messageCount: number;

  // Get the messages we just imported
  const importedMessages = db.prepare(`
    SELECT id, content, role, timestamp
    FROM messages
    WHERE session_id = ?
    ORDER BY timestamp
    ${options.limit ? 'LIMIT ?' : ''}
  `).all(parsed.sessionId, ...(options.limit ? [options.limit] : [])) as Array<{
    id: number;
    content: string;
    role: string;
    timestamp: string;
  }>;

  if (importedMessages.length === 0) {
    console.log('\nNo messages to capture for LoA');
    return;
  }

  // FIX #6: Proper null checks instead of non-null assertion
  const firstMsg = importedMessages[0];
  const lastMsg = importedMessages[importedMessages.length - 1];

  if (firstMsg.id === undefined || firstMsg.id === null || lastMsg.id === undefined || lastMsg.id === null) {
    console.error('\nError: Messages missing IDs after import');
    process.exit(1);
  }

  startId = firstMsg.id;
  endId = lastMsg.id;
  messageCount = importedMessages.length;

  // Format transcript for extraction
  const conversationText = importedMessages.map(m => {
    const role = m.role.toUpperCase();
    const time = m.timestamp.split('T')[1]?.split('.')[0] || '';
    return `[${role} ${time}]\n${m.content}`;
  }).join('\n\n---\n\n');

  console.log(`\nExtracting ${messageCount} messages via \`claude --print --model ${EXTRACT_MODEL}\`...`);

  let fabricExtract: string;
  try {
    fabricExtract = runExtract(conversationText);
  } catch (err) {
    console.error(`\nExtraction failed: ${err instanceof Error ? err.message : err}`);
    console.log('Messages were imported but LoA entry was not created.');
    return;
  }

  // Create LoA entry
  const loaId = createLoaEntry({
    title,
    fabric_extract: fabricExtract,
    message_range_start: startId,
    message_range_end: endId,
    parent_loa_id: options.continues,
    project: options.project || parsed.project,
    tags: options.tags,
    message_count: messageCount
  });

  console.log(`\n✓ LoA #${loaId} captured: "${title}"`);
  console.log(`  Messages: ${messageCount} (IDs ${startId}-${endId})`);
  console.log(`  Project: ${options.project || parsed.project}`);

  // Auto-embed for semantic search (Phase 3)
  await autoEmbedLoaEntry(loaId, title, fabricExtract);

  // Show preview
  console.log('\n--- Extract Preview ---\n');
  console.log(fabricExtract.slice(0, 500) + (fabricExtract.length > 500 ? '...' : ''));
}
