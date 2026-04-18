// Import conversations from Claude Code JSONL files

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { getDb } from '../db/connection.js';
import { createSession, sessionExists, addMessagesBatch } from './memory.js';
import { extractProjectFromPath } from './project.js';
import type { ClaudeSessionLine, Message } from '../types/index.js';

const CLAUDE_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

interface ImportResult {
  sessionsImported: number;
  sessionsSkipped: number;
  messagesImported: number;
  errors: string[];
}

/**
 * Find all session JSONL files (excluding subagent files)
 */
export function findSessionFiles(): string[] {
  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    return [];
  }

  const files: string[] = [];

  const projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const projectDir of projectDirs) {
    const projectPath = join(CLAUDE_PROJECTS_DIR, projectDir);

    const jsonlFiles = readdirSync(projectPath, { withFileTypes: true })
      .filter(f => f.isFile() && f.name.endsWith('.jsonl'))
      .map(f => join(projectPath, f.name));

    files.push(...jsonlFiles);
  }

  return files;
}

/**
 * Parse a single JSONL session file
 */
function parseSessionFile(filePath: string): { sessionId: string; project: string; messages: Omit<Message, 'id'>[] } | null {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length === 0) return null;

  const messages: Omit<Message, 'id'>[] = [];
  let sessionId: string | null = null;
  let project: string | null = null;
  let cwd: string | null = null;

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ClaudeSessionLine;

      // Skip non-message types
      if (parsed.type !== 'user' && parsed.type !== 'assistant') {
        continue;
      }

      // Extract session metadata from first valid message
      if (!sessionId && parsed.sessionId) {
        sessionId = parsed.sessionId;
      }
      if (!cwd && parsed.cwd) {
        cwd = parsed.cwd;
      }

      // Extract message content
      if (parsed.message?.content) {
        let content: string;

        if (typeof parsed.message.content === 'string') {
          content = parsed.message.content;
        } else if (Array.isArray(parsed.message.content)) {
          // Handle array content (with text blocks)
          content = parsed.message.content
            .filter(block => block.type === 'text' && block.text)
            .map(block => block.text)
            .join('\n');
        } else {
          continue;
        }

        if (content.trim()) {
          messages.push({
            session_id: parsed.sessionId || sessionId || 'unknown',
            timestamp: parsed.timestamp || new Date().toISOString(),
            role: parsed.type as 'user' | 'assistant',
            content: content,
            project: project || undefined
          });
        }
      }
    } catch {
      // Skip malformed lines
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
    // Use filename as session ID
    sessionId = basename(filePath, '.jsonl');
  }

  return {
    sessionId,
    project,
    messages
  };
}

/**
 * Import all sessions from Claude Code projects directory
 */
export function importAllSessions(options?: { dryRun?: boolean; verbose?: boolean }): ImportResult {
  const result: ImportResult = {
    sessionsImported: 0,
    sessionsSkipped: 0,
    messagesImported: 0,
    errors: []
  };

  const files = findSessionFiles();

  if (options?.verbose) {
    console.log(`Found ${files.length} session files`);
  }

  for (const file of files) {
    try {
      const parsed = parseSessionFile(file);

      if (!parsed || parsed.messages.length === 0) {
        result.sessionsSkipped++;
        continue;
      }

      // Check if session already exists
      if (sessionExists(parsed.sessionId)) {
        if (options?.verbose) {
          console.log(`Skipping existing session: ${parsed.sessionId}`);
        }
        result.sessionsSkipped++;
        continue;
      }

      if (options?.dryRun) {
        console.log(`[DRY RUN] Would import session ${parsed.sessionId} (${parsed.messages.length} messages)`);
        result.sessionsImported++;
        result.messagesImported += parsed.messages.length;
        continue;
      }

      // Get timestamps from messages
      const timestamps = parsed.messages.map(m => m.timestamp).sort();
      const startedAt = timestamps[0];
      const endedAt = timestamps[timestamps.length - 1];

      // Create session
      createSession({
        session_id: parsed.sessionId,
        started_at: startedAt,
        ended_at: endedAt,
        project: parsed.project,
        summary: `Imported from ${basename(file)}`
      });

      // Insert messages in batch
      const count = addMessagesBatch(parsed.messages);

      result.sessionsImported++;
      result.messagesImported += count;

      if (options?.verbose) {
        console.log(`Imported session ${parsed.sessionId}: ${count} messages`);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      result.errors.push(`${file}: ${error}`);
    }
  }

  return result;
}

/**
 * Get import preview without making changes
 */
export function previewImport(): { total: number; existing: number; new: number; files: string[] } {
  const files = findSessionFiles();
  let existing = 0;
  let newSessions = 0;

  for (const file of files) {
    const parsed = parseSessionFile(file);
    if (!parsed) continue;

    if (sessionExists(parsed.sessionId)) {
      existing++;
    } else {
      newSessions++;
    }
  }

  return {
    total: files.length,
    existing,
    new: newSessions,
    files
  };
}
