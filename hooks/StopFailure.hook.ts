#!/usr/bin/env bun
/**
 * StopFailure.hook.ts — Fires when a turn ends due to API error
 *
 * Logs the error to ERROR_PATTERNS.json and EXTRACT_LOG.txt.
 */

import { appendFileSync, readFileSync, writeFileSync } from "fs";

const MEMORY_DIR = `${process.env.HOME}/.claude/MEMORY`;
const ERROR_FILE = `${MEMORY_DIR}/ERROR_PATTERNS.json`;
const EXTRACT_LOG = `${MEMORY_DIR}/EXTRACT_LOG.txt`;

interface StopFailureInput {
  error?: string;
  error_code?: string;
  status_code?: number;
  session_id?: string;
  cwd?: string;
}

interface ErrorRecord {
  timestamp: string;
  type: string;
  error_code: string;
  error: string;
  session_id: string | null;
}

async function main() {
  let input: StopFailureInput = {};
  try {
    const raw = await Bun.stdin.text();
    input = JSON.parse(raw);
  } catch {
    // No input or invalid JSON — still log that it fired
  }

  const timestamp = new Date().toISOString();
  const errorCode = input.error_code || input.status_code?.toString() || "unknown";
  const errorMsg = input.error || "API error (no details provided)";

  // 1. Log to EXTRACT_LOG
  try {
    appendFileSync(EXTRACT_LOG, `[${timestamp}] STOP_FAILURE: code=${errorCode} error=${errorMsg}\n`);
  } catch {}

  // 2. Log to ERROR_PATTERNS.json
  try {
    let errors: ErrorRecord[] = [];
    try { errors = JSON.parse(readFileSync(ERROR_FILE, "utf-8")); } catch { errors = []; }

    errors.push({
      timestamp,
      type: "stop_failure",
      error_code: errorCode,
      error: errorMsg,
      session_id: input.session_id || null,
    });

    if (errors.length > 200) errors = errors.slice(-200);
    writeFileSync(ERROR_FILE, JSON.stringify(errors, null, 2));
  } catch {}
}

main().catch(() => process.exit(1));
