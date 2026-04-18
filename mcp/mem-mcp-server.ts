#!/usr/bin/env bun
/**
 * mem-mcp-server.ts — MCP server for PAI memory search
 *
 * Exposes memory.db (SQLite + FTS5) as MCP tools so Claude can search
 * past sessions, decisions, errors, and learnings without shelling out.
 *
 * Tools:
 *   memory_search  — Full-text search across all memory tables
 *   memory_recall  — Get recent session extractions for context loading
 *
 * Runs as stdio MCP server, wired in settings.json mcpServers.
 */

import { Database } from "bun:sqlite";
import { join } from "path";

const DB_PATH = join(process.env.HOME!, ".claude", "memory.db");

// ─── MCP Protocol Types ───────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: any;
  error?: { code: number; message: string };
}

// ─── Database Queries ─────────────────────────────────────────────

function getDb(): Database {
  return new Database(DB_PATH, { readonly: true });
}

function searchMemory(query: string, limit: number = 15): any[] {
  const db = getDb();
  const results: any[] = [];

  // Search LoA entries (session extractions)
  try {
    const loa = db
      .prepare(
        `SELECT l.created_at, l.project, l.title, snippet(loa_fts, 1, '>>>', '<<<', '...', 40) as excerpt
         FROM loa_fts JOIN loa_entries l ON loa_fts.rowid = l.id
         WHERE loa_fts MATCH ?
         ORDER BY rank LIMIT ?`
      )
      .all(query, limit);
    for (const r of loa as any[]) {
      results.push({ type: "session", date: r.created_at, project: r.project, title: r.title, excerpt: r.excerpt });
    }
  } catch {}

  // Search decisions
  try {
    const decisions = db
      .prepare(
        `SELECT d.created_at, d.project, d.decision, d.reasoning
         FROM decisions_fts JOIN decisions d ON decisions_fts.rowid = d.id
         WHERE decisions_fts MATCH ?
         ORDER BY rank LIMIT ?`
      )
      .all(query, Math.min(limit, 10));
    for (const r of decisions as any[]) {
      results.push({ type: "decision", date: r.created_at, project: r.project, decision: r.decision, reasoning: r.reasoning });
    }
  } catch {}

  // Search errors
  try {
    const errors = db
      .prepare(
        `SELECT e.created_at, e.error, e.fix, e.frequency
         FROM errors_fts JOIN errors e ON errors_fts.rowid = e.id
         WHERE errors_fts MATCH ?
         ORDER BY rank LIMIT ?`
      )
      .all(query, Math.min(limit, 10));
    for (const r of errors as any[]) {
      results.push({ type: "error", date: r.created_at, error: r.error, fix: r.fix, frequency: r.frequency });
    }
  } catch {}

  // Search learnings
  try {
    const learnings = db
      .prepare(
        `SELECT l.created_at, l.project, l.problem, l.solution
         FROM learnings_fts JOIN learnings l ON learnings_fts.rowid = l.id
         WHERE learnings_fts MATCH ?
         ORDER BY rank LIMIT ?`
      )
      .all(query, Math.min(limit, 10));
    for (const r of learnings as any[]) {
      results.push({ type: "learning", date: r.created_at, project: r.project, problem: r.problem, solution: r.solution });
    }
  } catch {}

  db.close();
  return results;
}

function recallRecent(count: number = 5, project?: string): any[] {
  const db = getDb();
  let query = `SELECT created_at, project, title, fabric_extract FROM loa_entries`;
  const params: any[] = [];

  if (project) {
    query += ` WHERE project = ?`;
    params.push(project);
  }

  query += ` ORDER BY rowid DESC LIMIT ?`;
  params.push(count);

  const results = db.prepare(query).all(...params) as any[];
  db.close();
  return results;
}

function getStats(): any {
  const db = getDb();
  const stats = {
    sessions: (db.prepare("SELECT COUNT(*) as c FROM loa_entries").get() as any).c,
    decisions: (db.prepare("SELECT COUNT(*) as c FROM decisions").get() as any).c,
    errors: (db.prepare("SELECT COUNT(*) as c FROM errors").get() as any).c,
    learnings: (db.prepare("SELECT COUNT(*) as c FROM learnings").get() as any).c,
    date_range: db.prepare("SELECT MIN(created_at) as earliest, MAX(created_at) as latest FROM loa_entries").get(),
  };
  db.close();
  return stats;
}

// ─── MCP Protocol Handler ─────────────────────────────────────────

const TOOLS = [
  {
    name: "memory_search",
    description:
      "Search your persistent memory across all sessions, decisions, errors, and learnings. Uses full-text search (FTS5) over your extracted session transcripts. Use this to find past context, decisions, error fixes, or any topic discussed in previous conversations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, description: "Search query (supports FTS5 syntax: AND, OR, NOT, phrases in quotes)" },
        limit: { type: "number" as const, description: "Max results (default 15)", default: 15 },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_recall",
    description:
      "Get recent session extractions for context loading. Returns the most recent conversation summaries, optionally filtered by project name.",
    inputSchema: {
      type: "object" as const,
      properties: {
        count: { type: "number" as const, description: "Number of recent sessions (default 5)", default: 5 },
        project: { type: "string" as const, description: "Filter by project name (optional)" },
      },
    },
  },
];

function handleRequest(req: JsonRpcRequest): JsonRpcResponse {
  switch (req.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: req.id ?? null,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "pai-memory", version: "1.0.0" },
        },
      };

    case "notifications/initialized":
      // No response needed for notifications
      return null as any;

    case "tools/list":
      return { jsonrpc: "2.0", id: req.id ?? null, result: { tools: TOOLS } };

    case "tools/call": {
      const toolName = req.params?.name;
      const args = req.params?.arguments || {};

      if (toolName === "memory_search") {
        const results = searchMemory(args.query, args.limit || 15);
        const stats = getStats();
        const text =
          results.length === 0
            ? `No results for "${args.query}" (searched ${stats.sessions} sessions, ${stats.decisions} decisions, ${stats.errors} errors)`
            : results
                .map((r) => {
                  if (r.type === "session") return `[SESSION ${r.date}] ${r.project}: ${r.title}\n  ${r.excerpt}`;
                  if (r.type === "decision") return `[DECISION ${r.date}] ${r.project}: ${r.decision} — ${r.reasoning || ""}`;
                  if (r.type === "error") return `[ERROR ×${r.frequency}] ${r.error}: ${r.fix}`;
                  if (r.type === "learning") return `[LEARNING ${r.date}] ${r.project}: ${r.problem} → ${r.solution}`;
                  return JSON.stringify(r);
                })
                .join("\n\n");

        return {
          jsonrpc: "2.0",
          id: req.id ?? null,
          result: { content: [{ type: "text", text }] },
        };
      }

      if (toolName === "memory_recall") {
        const results = recallRecent(args.count || 5, args.project);
        const text =
          results.length === 0
            ? "No recent sessions found."
            : results
                .map((r) => `## ${r.created_at} | ${r.project}\n${r.title}\n\n${r.fabric_extract?.slice(0, 500) || ""}`)
                .join("\n\n---\n\n");

        return {
          jsonrpc: "2.0",
          id: req.id ?? null,
          result: { content: [{ type: "text", text }] },
        };
      }

      return {
        jsonrpc: "2.0",
        id: req.id ?? null,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      };
    }

    default:
      return {
        jsonrpc: "2.0",
        id: req.id ?? null,
        error: { code: -32601, message: `Unknown method: ${req.method}` },
      };
  }
}

// ─── Stdio Transport ──────────────────────────────────────────────

async function main() {
  const decoder = new TextDecoder();
  let buffer = "";

  const reader = Bun.stdin.stream().getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines (JSON-RPC messages are newline-delimited)
    let newlineIdx;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);

      if (!line) continue;

      try {
        const req: JsonRpcRequest = JSON.parse(line);
        const res = handleRequest(req);
        if (res) {
          process.stdout.write(JSON.stringify(res) + "\n");
        }
      } catch (e: any) {
        const errorRes: JsonRpcResponse = {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: `Parse error: ${e.message}` },
        };
        process.stdout.write(JSON.stringify(errorRes) + "\n");
      }
    }
  }
}

main();
