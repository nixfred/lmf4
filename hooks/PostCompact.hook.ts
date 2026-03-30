#!/usr/bin/env bun
/**
 * PostCompact.hook.ts — Fires after context compaction completes
 *
 * Verifies that critical state survived compaction by checking:
 * 1. Active PRD still exists and is readable
 * 2. Logs the compaction event for tracking
 *
 * Complements PreCompact.hook.sh which saves context BEFORE compaction.
 */

import { appendFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const MEMORY_DIR = `${process.env.HOME}/.claude/MEMORY`;
const EXTRACT_LOG = `${MEMORY_DIR}/EXTRACT_LOG.txt`;
const WORK_DIR = `${MEMORY_DIR}/WORK`;

interface PostCompactInput {
  session_id?: string;
  cwd?: string;
  context_window?: {
    used_percentage?: number;
    remaining_percentage?: number;
  };
}

interface WorkDir {
  name: string;
  mtime: number;
}

function log(line: string) {
  try { appendFileSync(EXTRACT_LOG, line); } catch {}
}

async function main() {
  let input: PostCompactInput = {};
  try {
    const raw = await Bun.stdin.text();
    input = JSON.parse(raw);
  } catch {}

  const timestamp = new Date().toISOString();
  const contextPct = input.context_window?.used_percentage ?? "unknown";
  const remaining = input.context_window?.remaining_percentage ?? "unknown";

  log(`[${timestamp}] POST_COMPACT: context=${contextPct}% remaining=${remaining}%\n`);

  // Check most recent active PRD still exists
  try {
    const workDirs: WorkDir[] = readdirSync(WORK_DIR)
      .filter((d) => !d.startsWith("."))
      .map((d) => ({ name: d, mtime: statSync(join(WORK_DIR, d)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    if (workDirs.length > 0) {
      const latestPrd = join(WORK_DIR, workDirs[0].name, "PRD.md");
      try {
        const content = await Bun.file(latestPrd).text();
        const phase = content.match(/^phase:\s*(\w+)/m)?.[1] ?? "unknown";
        const progress = content.match(/^progress:\s*(\S+)/m)?.[1] ?? "unknown";
        log(`[${timestamp}] POST_COMPACT: Active PRD=${workDirs[0].name} phase=${phase} progress=${progress} — state preserved\n`);
      } catch {
        log(`[${timestamp}] POST_COMPACT: WARNING — latest PRD not found at ${latestPrd}\n`);
      }
    }
  } catch (e) {
    log(`[${timestamp}] POST_COMPACT: Error checking PRD: ${e}\n`);
  }
}

main().catch(() => process.exit(1));
