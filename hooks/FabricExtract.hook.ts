#!/usr/bin/env bun
/**
 * FabricExtract.hook.ts - Extract Context for Future Sessions
 *
 * PURPOSE:
 * Extracts structured context from session transcripts at session end.
 * Uses Anthropic API (claude-3-5-haiku) to analyze the conversation and
 * update 6 memory files for persistent recall across sessions.
 *
 * TRIGGER: Stop (wired in settings.json)
 *
 * INPUT:
 * - stdin: Hook input JSON with cwd
 *
 * OUTPUT:
 * - Appends extracted context to ~/.claude/MEMORY/DISTILLED.md
 * - Updates HOT_RECALL.md (last N sessions)
 * - Updates SESSION_INDEX.json (searchable lookup)
 * - Appends to DECISIONS.log, REJECTIONS.log, ERROR_PATTERNS.json
 *
 * FLOW:
 * 1. Find current session's conversation JSONL
 * 2. Extract message content (skip metadata/tool noise)
 * 3. Call Anthropic API (claude-3-5-haiku) for structured extraction
 * 4. Parse output and update all 6 memory files
 *
 * PERFORMANCE:
 * - Runs asynchronously via self-spawn, non-blocking
 *
 * Part of LMF4 (Larry Memory Framework v4)
 */

import { existsSync, readFileSync, appendFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync, spawn } from 'child_process';

const MEMORY_DIR = join(process.env.HOME!, '.claude', 'MEMORY');
const EXTRACT_LOG = join(MEMORY_DIR, 'EXTRACT_LOG.txt');
const DISTILLED_PATH = join(MEMORY_DIR, 'DISTILLED.md');
const HOT_RECALL_PATH = join(MEMORY_DIR, 'HOT_RECALL.md');
const SESSION_INDEX_PATH = join(MEMORY_DIR, 'SESSION_INDEX.json');
const DECISIONS_PATH = join(MEMORY_DIR, 'DECISIONS.log');
const REJECTIONS_PATH = join(MEMORY_DIR, 'REJECTIONS.log');
const ERRORS_PATH = join(MEMORY_DIR, 'ERROR_PATTERNS.json');
const PROJECTS_DIR = join(process.env.HOME!, '.claude', 'projects');
const DEDUP_DB_PATH = join(MEMORY_DIR, '.extraction_tracker.json');

const HOT_RECALL_MAX_SESSIONS = 10;
const EXTRACT_PROMPT_PATH = join(MEMORY_DIR, 'extract_prompt.md');

// Inference via Claude CLI (uses subscription, not API credits)
// Check multiple locations: LMF4 tools dir, PAI Tools dir, or fallback to claude --print
const HOME_DIR = process.env.HOME!;
const INFERENCE_PATHS = [
  join(HOME_DIR, '.claude', 'tools', 'Inference.ts'),          // LMF4 standalone
  join(HOME_DIR, '.claude', 'PAI', 'Tools', 'Inference.ts'),   // PAI installation
];
const INFERENCE_PATH = INFERENCE_PATHS.find(p => existsSync(p)) || '';

// ─── Interfaces ────────────────────────────────────────────────────

interface SessionIndexEntry {
  sessionId: string;
  project: string;
  date: string;
  timestamp: number;
  topics: string[];
  summary: string;
  file: string;
}

interface HookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
}

interface ExtractionRecord {
  size: number;
  extractedAt?: string;
  failedAt?: string;
  retryAfter?: string;
}

// ─── Ensure memory directories exist ───────────────────────────────

function ensureMemoryDirs(): void {
  for (const dir of [MEMORY_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

// ─── Conversation finder ───────────────────────────────────────────

function findCurrentConversation(cwd: string): string | null {
  const encodedPath = '-' + cwd.replace(/^\//, '').replace(/[\/\_]/g, '-');
  const projectDir = join(PROJECTS_DIR, encodedPath);

  if (!existsSync(projectDir)) return null;

  const files = readdirSync(projectDir)
    .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
    .map(f => ({
      name: f,
      path: join(projectDir, f),
      mtime: statSync(join(projectDir, f)).mtimeMs
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return files.length > 0 ? files[0].path : null;
}

// ─── Message extraction ────────────────────────────────────────────

function extractTextFromContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((block: any) => block.type === 'text' && block.text)
      .map((block: any) => block.text)
      .join('\n');
  }
  if (content?.text) return content.text;
  return '';
}

function extractMessages(jsonlPath: string): string {
  const content = readFileSync(jsonlPath, 'utf-8');
  const lines = content.trim().split('\n');
  const messages: string[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (!entry.message?.content) continue;
      const role = entry.message.role;
      if (role !== 'user' && role !== 'assistant') continue;
      const text = extractTextFromContent(entry.message.content);
      if (!text || text.trim().length < 10) continue;
      if (text.trim().startsWith('[{') || text.trim().startsWith('{"tool_use_id"')) continue;
      const truncated = text.length > 4000 ? text.slice(0, 4000) + '...[truncated]' : text;
      messages.push(`[${role.toUpperCase()}]: ${truncated}`);
    } catch {
      // Skip malformed lines
    }
  }

  return messages.join('\n\n');
}

// ─── Dedup tracking ────────────────────────────────────────────────

function loadExtractionTracker(): Record<string, ExtractionRecord> {
  try {
    if (existsSync(DEDUP_DB_PATH)) {
      return JSON.parse(readFileSync(DEDUP_DB_PATH, 'utf-8'));
    }
  } catch {}
  return {};
}

function saveExtractionTracker(tracker: Record<string, ExtractionRecord>): void {
  try { writeFileSync(DEDUP_DB_PATH, JSON.stringify(tracker, null, 2), 'utf-8'); } catch {}
}

function wasAlreadyExtracted(convPath: string): boolean {
  const tracker = loadExtractionTracker();
  const record = tracker[convPath];
  if (!record) return false;

  try {
    const currentSize = statSync(convPath).size;
    const growth = (currentSize - record.size) / record.size;
    if (growth > 0.5) {
      logExtract(`REGROWTH: ${convPath} grew ${Math.round(growth * 100)}%, re-extracting`);
      return false;
    }
    if (record.failedAt && !record.extractedAt) {
      const retryTime = record.retryAfter ? new Date(record.retryAfter).getTime() : new Date(record.failedAt).getTime() + 86400000;
      if (Date.now() >= retryTime) {
        logExtract(`RETRY: ${convPath} failed, retry window reached`);
        return false;
      }
      return true;
    }
    return true;
  } catch { return true; }
}

function markAsExtracted(convPath: string): void {
  try {
    const tracker = loadExtractionTracker();
    tracker[convPath] = { size: statSync(convPath).size, extractedAt: new Date().toISOString() };
    saveExtractionTracker(tracker);
  } catch {}
}

function markAsFailed(convPath: string): void {
  try {
    const tracker = loadExtractionTracker();
    const now = new Date();
    tracker[convPath] = {
      size: statSync(convPath).size,
      failedAt: now.toISOString(),
      retryAfter: new Date(now.getTime() + 86400000).toISOString()
    };
    saveExtractionTracker(tracker);
  } catch {}
}

// ─── Topic extraction ──────────────────────────────────────────────

function extractTopics(fabricOutput: string): string[] {
  const topics: string[] = [];
  const patterns = [
    /(?:##\s*DECISIONS\s*MADE|DECISIONS:)\s*([\s\S]*?)(?=\n##\s|$)/,
    /(?:##\s*MAIN\s*IDEAS|MAIN_IDEAS:)\s*([\s\S]*?)(?=\n##\s|$)/,
    /(?:##\s*INSIGHTS|INSIGHTS:)\s*([\s\S]*?)(?=\n##\s|$)/
  ];

  for (const pattern of patterns) {
    const match = fabricOutput.match(pattern);
    if (match) {
      const lines = match[1].split('\n').filter(l => l.trim().startsWith('-'));
      for (const line of lines.slice(0, 3)) {
        const topic = line.replace(/^-\s*/, '').replace(/\*\*/g, '').split(':')[0].trim();
        if (topic && topic.length < 50) topics.push(topic);
      }
    }
  }

  return [...new Set(topics)].slice(0, 5);
}

// ─── Memory file updaters ──────────────────────────────────────────

function updateSessionIndex(entry: SessionIndexEntry): void {
  let index: SessionIndexEntry[] = [];
  if (existsSync(SESSION_INDEX_PATH)) {
    try { index = JSON.parse(readFileSync(SESSION_INDEX_PATH, 'utf-8')); } catch { index = []; }
  }
  index = index.filter(e => e.sessionId !== entry.sessionId);
  index.push(entry);
  index.sort((a, b) => b.timestamp - a.timestamp);
  index = index.slice(0, 500);
  writeFileSync(SESSION_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

function updateHotRecall(extracted: string, sessionLabel: string, timestamp: string): void {
  const header = `# Hot Recall (Last ${HOT_RECALL_MAX_SESSIONS} Sessions)

This file contains the most recent session extractions for fast context loading.
Full archive: DISTILLED.md

---
`;

  let sections: string[] = [];
  if (existsSync(HOT_RECALL_PATH)) {
    const content = readFileSync(HOT_RECALL_PATH, 'utf-8');
    const sectionMatches = content.split(/\n+---\n+## Extracted:\s*/);
    for (let i = 1; i < sectionMatches.length; i++) {
      sections.push('## Extracted: ' + sectionMatches[i]);
    }
  }

  sections.unshift(`## Extracted: ${timestamp} | ${sessionLabel}\n\n${extracted.trim()}\n`);
  sections = sections.slice(0, HOT_RECALL_MAX_SESSIONS);

  writeFileSync(HOT_RECALL_PATH, header + '\n' + sections.join('\n\n---\n\n'), 'utf-8');
}

function appendDecisions(fabricOutput: string, sessionLabel: string, timestamp: string): void {
  const decisionsMatch = fabricOutput.match(/(?:##\s*DECISIONS\s*MADE|DECISIONS:)\s*([\s\S]*?)(?=\n##\s|$)/);
  if (!decisionsMatch) return;

  const lines = decisionsMatch[1].split('\n')
    .filter(l => l.trim().startsWith('-'))
    .map(l => l.replace(/^-\s*/, '').replace(/\*\*/g, '').trim())
    .filter(l => l.length > 5);
  if (lines.length === 0) return;

  const normalize = (s: string) => s.toLowerCase().replace(/['"]/g, '').replace(/\s+/g, ' ').trim();
  const existing = new Set<string>();

  if (existsSync(DECISIONS_PATH)) {
    for (const line of readFileSync(DECISIONS_PATH, 'utf-8').split('\n')) {
      if (line.startsWith('#') || !line.trim()) continue;
      const parts = line.split('|');
      if (parts.length >= 3) existing.add(normalize(parts.slice(2).join('|')));
    }
  }

  const newEntries: string[] = [];
  for (const line of lines) {
    if (!existing.has(normalize(line))) {
      existing.add(normalize(line));
      newEntries.push(`${timestamp}|${sessionLabel}|${line.replace(/\|/g, '/')}`);
    }
  }

  if (newEntries.length > 0) {
    appendFileSync(DECISIONS_PATH, newEntries.join('\n') + '\n', 'utf-8');
    console.error(`[FabricExtract] Appended ${newEntries.length} decisions`);
  }
}

function appendRejections(fabricOutput: string, sessionLabel: string, timestamp: string): void {
  const match = fabricOutput.match(/(?:##\s*THINGS\s*TO\s*REJECT\s*\/?\s*AVOID|REJECTED:)\s*([\s\S]*?)(?=\n##\s|$)/);
  if (!match) return;

  const lines = match[1].split('\n')
    .filter(l => l.trim().startsWith('-'))
    .map(l => l.replace(/^-\s*/, '').replace(/\*\*/g, '').trim())
    .filter(l => l.length > 5);
  if (lines.length === 0) return;

  const entries = lines.map(l => `${timestamp}|${sessionLabel}|${l.replace(/\|/g, '/')}`);
  appendFileSync(REJECTIONS_PATH, entries.join('\n') + '\n', 'utf-8');
  console.error(`[FabricExtract] Appended ${entries.length} rejections`);
}

function appendErrors(fabricOutput: string, sessionLabel: string, timestamp: string): void {
  const match = fabricOutput.match(/(?:##\s*ERRORS?\s*FIXED|ERRORS_FIXED:)\s*([\s\S]*?)(?=\n##\s|$)/);
  if (!match) return;

  const lines = match[1].split('\n')
    .filter(l => l.trim().startsWith('-'))
    .map(l => l.replace(/^-\s*/, '').replace(/\*\*/g, '').trim())
    .filter(l => l.includes(':'));
  if (lines.length === 0) return;

  let data: { patterns: any[]; meta?: any } = { patterns: [] };
  if (existsSync(ERRORS_PATH)) {
    try { data = JSON.parse(readFileSync(ERRORS_PATH, 'utf-8')); } catch { data = { patterns: [] }; }
  }

  const normalize = (s: string) => s.toLowerCase().replace(/['"]/g, '').replace(/\s+/g, ' ').trim();
  const existingKeys = new Set(data.patterns.map((p: any) => normalize(p.error || '')));

  let added = 0;
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const error = line.slice(0, colonIdx).trim();
      const fix = line.slice(colonIdx + 1).trim();
      if (!existingKeys.has(normalize(error))) {
        existingKeys.add(normalize(error));
        data.patterns.push({ error, cause: 'auto-extracted', fix, file: sessionLabel, date: timestamp });
        added++;
      }
    }
  }

  if (added > 0) {
    data.meta = { purpose: 'Pattern match errors for instant recall', updated: timestamp };
    writeFileSync(ERRORS_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.error(`[FabricExtract] Appended ${added} error patterns`);
  }
}

// ─── Extraction via Inference.ts (Claude CLI subscription) ─────────

function getExtractionPrompt(): string {
  try {
    if (existsSync(EXTRACT_PROMPT_PATH)) {
      return readFileSync(EXTRACT_PROMPT_PATH, 'utf-8').trim();
    }
  } catch {}
  // Inline fallback
  return `You are an expert at extracting meaningful, factual information from AI coding session transcripts.
Extract ONLY what actually happened. Follow this format EXACTLY:

## ONE SENTENCE SUMMARY
[Single factual sentence]

## MAIN IDEAS
- [Concrete thing 1]
- [Concrete thing 2]

## DECISIONS MADE
- [Decision]: [reason]

## THINGS TO REJECT / AVOID
- [Thing to avoid]: [why]

## ERRORS FIXED
- [Error]: [fix]

## CONTEXT
[One sentence about impact on infrastructure]`;
}

const EXTRACTION_PROMPT = getExtractionPrompt();

/**
 * Extract using Inference.ts (Claude CLI with subscription billing)
 * Falls back to direct claude --print if Inference.ts is unavailable
 */
async function extractWithInference(messages: string): Promise<string | null> {
  const maxChars = 60000; // Keep reasonable for haiku via CLI
  const truncated = messages.length > maxChars ? messages.slice(-maxChars) : messages;

  try {
    // Write messages to temp file to avoid ARG_MAX
    const tmpFile = join('/tmp', `fabric-extract-${Date.now()}.txt`);
    writeFileSync(tmpFile, truncated, 'utf-8');

    const userPrompt = `Extract the key information from this AI coding session transcript:\n\n${truncated}`;

    // Use Inference.ts if available, otherwise fall back to direct claude --print
    let result: string;
    if (existsSync(INFERENCE_PATH)) {
      const { inference } = await import(INFERENCE_PATH);
      const res = await inference({
        systemPrompt: EXTRACTION_PROMPT,
        userPrompt,
        level: 'fast',
        timeout: 60000,
      });

      // Clean up temp file
      try { const { unlinkSync } = await import('fs'); unlinkSync(tmpFile); } catch {}

      if (!res.success) {
        console.error(`[FabricExtract] Inference failed: ${res.error}`);
        return null;
      }
      result = res.output;
    } else {
      // Direct claude --print fallback
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.CLAUDECODE;

      result = execSync(
        `claude --print --bare --model haiku --output-format text --system-prompt "${EXTRACTION_PROMPT.replace(/"/g, '\\"').slice(0, 500)}"`,
        {
          input: userPrompt,
          encoding: 'utf-8',
          timeout: 60000,
          maxBuffer: 10 * 1024 * 1024,
          env,
        }
      ).trim();

      try { const { unlinkSync } = await import('fs'); unlinkSync(tmpFile); } catch {}
    }

    if (result && result.trim().length > 50) {
      console.error(`[FabricExtract] Extraction successful (${result.length} chars)`);
      logExtract(`SUCCESS: extraction=${result.length} chars`);
      return result.trim();
    }
    console.error("[FabricExtract] Empty/short response");
    return null;
  } catch (error: any) {
    console.error(`[FabricExtract] Extraction failed: ${error.message}`);
    return null;
  }
}

/**
 * Chunked extraction for large conversations
 */
async function extractChunked(messages: string): Promise<string | null> {
  const CHUNK_SIZE = 50000;
  const chunks: string[] = [];
  const lines = messages.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = '';
    }
    currentChunk += line + '\n';
  }
  if (currentChunk.trim()) chunks.push(currentChunk);

  console.error(`[FabricExtract] CHUNKED: ${messages.length} chars -> ${chunks.length} chunks`);
  logExtract(`CHUNKED: ${messages.length} chars -> ${chunks.length} chunks`);

  const partials: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    console.error(`[FabricExtract] CHUNKED: chunk ${i + 1}/${chunks.length}`);
    const result = await extractWithInference(chunks[i]);
    if (result) partials.push(result);
    if (i < chunks.length - 1) await new Promise(resolve => setTimeout(resolve, 3000));
  }

  if (partials.length === 0) return null;
  if (partials.length === 1) return partials[0];

  // Meta-extract: merge partials
  try {
    const mergeResult = await extractWithInference(
      `Merge these ${partials.length} partial session extractions into one coherent summary. Deduplicate and combine:\n\n${partials.join('\n\n---\n\n')}`
    );
    if (mergeResult) return mergeResult;
  } catch {}

  return partials.join('\n\n');
}

// ─── Main extraction pipeline ──────────────────────────────────────

async function extractAndAppend(conversationPath: string, cwd: string): Promise<void> {
  try {
    ensureMemoryDirs();

    if (wasAlreadyExtracted(conversationPath)) {
      console.error('[FabricExtract] Already extracted, skipping');
      return;
    }

    const messages = extractMessages(conversationPath);
    if (messages.length < 500) {
      console.error('[FabricExtract] Conversation too short, skipping');
      return;
    }

    let extracted: string = "";

    if (messages.length > 60000) {
      const chunkedResult = await extractChunked(messages);
      if (chunkedResult) extracted = chunkedResult;
    } else {
      const result = await extractWithInference(messages);
      if (result) extracted = result;
    }

    if (!extracted) {
      console.error("[FabricExtract] Extraction failed");
      logExtract("FAILURE: Extraction failed");
      markAsFailed(conversationPath);
      return;
    }

    // Quality gate
    if (!extracted.includes('ONE SENTENCE SUMMARY') && !extracted.includes('MAIN IDEAS')) {
      console.error("[FabricExtract] QUALITY GATE FAILED");
      logExtract("QUALITY GATE FAILED");
      markAsFailed(conversationPath);
      return;
    }

    const timestamp = new Date().toISOString().split('T')[0];
    const dirName = cwd.split('/').pop() || 'unknown';
    const sessionId = conversationPath.split('/').pop()?.replace('.jsonl', '') || 'unknown';

    // Write to SQLite database (primary storage)
    const summaryMatch = extracted.match(/##\s*ONE\s*SENTENCE\s*SUMMARY\s*\n+(.+)/);
    try {
      writeToDb(extracted, dirName, timestamp, sessionId, summaryMatch ? summaryMatch[1].trim() : `${dirName} session`);
    } catch (dbErr: any) {
      console.error(`[FabricExtract] DB write failed: ${dbErr.message}`);
    }

    // Write to flat files (secondary storage — loaded at session start)
    try {
      const topics = extractTopics(extracted);
      const summary = summaryMatch ? summaryMatch[1].trim() : `${dirName} session`;

      // Append to DISTILLED.md (full archive)
      appendFileSync(DISTILLED_PATH, `\n\n## Extracted: ${timestamp} | ${dirName}\n\n${extracted.trim()}\n\n---\n`, 'utf-8');

      // Update HOT_RECALL.md (last N sessions)
      updateHotRecall(extracted, dirName, timestamp);

      // Update SESSION_INDEX.json (searchable lookup)
      updateSessionIndex({
        sessionId,
        project: dirName,
        date: timestamp,
        timestamp: Date.now(),
        topics: topics.length > 0 ? topics : ['None'],
        summary,
        file: conversationPath,
      });

      // Append decisions, rejections, error patterns
      appendDecisions(extracted, dirName, timestamp);
      appendRejections(extracted, dirName, timestamp);
      appendErrors(extracted, dirName, timestamp);

      console.error(`[FabricExtract] Flat files updated`);
    } catch (flatErr: any) {
      console.error(`[FabricExtract] Flat file write failed: ${flatErr.message}`);
    }

    // Mark as extracted
    markAsExtracted(conversationPath);

    logExtract(`SUCCESS: All memory files updated for session=${dirName}`);
    console.error(`[FabricExtract] All memory files + DB updated`);

  } catch (error: any) {
    console.error(`[FabricExtract] Extraction failed: ${error.message}`);
    logExtract(`FAILURE: ${error.message}`);
  }
}

// ─── SQLite DB writes ──────────────────────────────────────────────

const DB_PATH = join(process.env.HOME!, '.claude', 'memory.db');

function writeToDb(extracted: string, project: string, date: string, sessionId: string, title: string): void {
  // Only write if DB exists (mem init has been run)
  if (!existsSync(DB_PATH)) return;

  const { Database } = require('bun:sqlite');
  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode=WAL');

  // 1. Insert LoA entry
  const loaResult = db.prepare(
    `INSERT INTO loa_entries (created_at, title, fabric_extract, session_id, project) VALUES (?, ?, ?, ?, ?)`
  ).run(date, title, extracted, sessionId, project);

  // NOTE: Do NOT insert into loa_fts manually — the trigger handles FTS sync automatically

  // 2. Extract and insert decisions
  const decisionsMatch = extracted.match(/(?:##\s*DECISIONS\s*MADE|DECISIONS:)\s*([\s\S]*?)(?=\n##\s|$)/);
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
        `INSERT INTO decisions (created_at, session_id, project, decision, reasoning) VALUES (?, ?, ?, ?, ?)`
      ).run(date, sessionId, project, decision, reasoning);

      // NOTE: trigger handles FTS sync automatically
    }
  }

  // 3. Extract and insert errors
  const errorsMatch = extracted.match(/(?:##\s*ERRORS?\s*FIXED|ERRORS_FIXED:)\s*([\s\S]*?)(?=\n##\s|$)/);
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

        // Upsert: increment frequency if error exists, else insert
        const existing = db.prepare('SELECT id, frequency FROM errors WHERE error = ?').get(error) as any;
        if (existing) {
          db.prepare('UPDATE errors SET frequency = frequency + 1, last_seen = CURRENT_TIMESTAMP, fix = ? WHERE id = ?')
            .run(fix, existing.id);
        } else {
          db.prepare('INSERT INTO errors (created_at, error, fix) VALUES (?, ?, ?)').run(date, error, fix);
          // NOTE: trigger handles FTS sync automatically
        }
      }
    }
  }

  db.close();
  console.error(`[FabricExtract] DB: LoA entry + decisions + errors written`);
}

// ─── Logging ───────────────────────────────────────────────────────

function logExtract(message: string): void {
  try {
    appendFileSync(EXTRACT_LOG, `[${new Date().toISOString()}] ${message}\n`, 'utf-8');
  } catch {}
}

// ─── CLI modes ─────────────────────────────────────────────────────

// --batch: Extract all unprocessed conversations (or all with --force)
if (process.argv.includes('--batch')) {
  const force = process.argv.includes('--force');
  logExtract(`BATCH: Starting${force ? ' (force)' : ''}`);
  console.error(`[FabricExtract] BATCH mode${force ? ' (force re-extract all)' : ' (unprocessed only)'}`);

  // Find all conversation JSONL files across all projects
  const allConvs: Array<{ path: string; cwd: string }> = [];
  if (existsSync(PROJECTS_DIR)) {
    for (const projDir of readdirSync(PROJECTS_DIR)) {
      const projPath = join(PROJECTS_DIR, projDir);
      try {
        if (!statSync(projPath).isDirectory()) continue;
        // Decode project dir back to cwd path
        const cwd = '/' + projDir.replace(/^-/, '').replace(/-/g, '/');
        for (const f of readdirSync(projPath)) {
          if (f.endsWith('.jsonl') && !f.startsWith('agent-')) {
            allConvs.push({ path: join(projPath, f), cwd });
          }
        }
      } catch { continue; }
    }
  }

  console.error(`[FabricExtract] BATCH: Found ${allConvs.length} conversation files`);
  logExtract(`BATCH: Found ${allConvs.length} conversation files`);

  (async () => {
    let processed = 0, skipped = 0, failed = 0;
    for (const conv of allConvs) {
      if (force) {
        // Clear tracker for this file
        try {
          const tracker = loadExtractionTracker();
          delete tracker[conv.path];
          saveExtractionTracker(tracker);
        } catch {}
      }

      if (!force && wasAlreadyExtracted(conv.path)) {
        skipped++;
        continue;
      }

      console.error(`[FabricExtract] BATCH: Processing ${conv.path.split('/').pop()} (${processed + 1})`);
      try {
        await extractAndAppend(conv.path, conv.cwd);
        processed++;
      } catch {
        failed++;
      }

      // Rate limit: 5 second pause between extractions
      if (processed + failed < allConvs.length - skipped) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    console.error(`[FabricExtract] BATCH: Done. Processed: ${processed}, Skipped: ${skipped}, Failed: ${failed}`);
    logExtract(`BATCH: Done. Processed: ${processed}, Skipped: ${skipped}, Failed: ${failed}`);
    process.exit(0);
  })();

// --reextract: Force re-extraction of a specific conversation
} else if (process.argv.includes('--reextract')) {
  const idx = process.argv.indexOf('--reextract');
  const convPath = process.argv[idx + 1];
  const cwd = process.argv[idx + 2] || process.cwd();
  if (convPath) {
    logExtract(`REEXTRACT: Forcing ${convPath}`);
    try {
      const tracker = loadExtractionTracker();
      delete tracker[convPath];
      saveExtractionTracker(tracker);
    } catch {}
    extractAndAppend(convPath, cwd).then(() => process.exit(0)).catch(() => process.exit(1));
  } else {
    console.error('Usage: bun FabricExtract.hook.ts --reextract <conversation.jsonl> [cwd]');
    process.exit(1);
  }
// --extract: Background extraction mode (spawned by main hook)
} else if (process.argv.includes('--extract')) {
  const idx = process.argv.indexOf('--extract');
  const convPath = process.argv[idx + 1];
  const cwd = process.argv[idx + 2];
  if (convPath && cwd) {
    logExtract(`BACKGROUND: Starting ${convPath}`);
    extractAndAppend(convPath, cwd).then(() => {
      logExtract(`BACKGROUND: Complete`);
      process.exit(0);
    }).catch((err) => {
      logExtract(`BACKGROUND: Failed: ${err}`);
      process.exit(1);
    });
  } else {
    process.exit(0);
  }
// Default: Hook mode — read stdin, spawn self in background, exit immediately
} else {

async function main() {
  try {
    let input = '';
    const decoder = new TextDecoder();
    const reader = Bun.stdin.stream().getReader();

    const timeoutPromise = new Promise<void>((resolve) => setTimeout(() => resolve(), 200));
    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        input += decoder.decode(value, { stream: true });
      }
    })();

    await Promise.race([readPromise, timeoutPromise]);

    if (!input || input.trim() === '') { process.exit(0); }

    let hookInput: HookInput;
    try { hookInput = JSON.parse(input); } catch { process.exit(0); }

    const cwd = hookInput.cwd || process.cwd();
    const conversationPath = findCurrentConversation(cwd);
    if (!conversationPath) {
      logExtract(`NO_CONVERSATION: ${cwd}`);
      process.exit(0);
    }

    // Spawn self in background for non-blocking extraction
    const child = spawn('bun', ['run', import.meta.path, '--extract', conversationPath, cwd], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    logExtract(`SPAWNED: PID ${child.pid} for ${conversationPath}`);
    process.exit(0);
  } catch (error) {
    logExtract(`ERROR: ${error}`);
    process.exit(0);
  }
}

main();
} // end default hook mode
