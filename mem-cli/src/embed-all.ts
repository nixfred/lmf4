#!/usr/bin/env bun
/**
 * embed-all.ts — Generate embeddings for all unembedded content via spark GPU
 * Batches writes to avoid DB locks. Picks up where it left off.
 */

import { Database } from 'bun:sqlite';
import { statSync } from 'fs';

const DB_PATH = process.env.HOME + '/.claude/memory.db';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';

async function embed(text: string): Promise<Float32Array | null> {
  const input = text.length > 8000 ? text.slice(0, 8000) : text;
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      body: JSON.stringify({ model: EMBED_MODEL, prompt: input }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    if (!data.embedding?.length) return null;
    return new Float32Array(data.embedding);
  } catch { return null; }
}

function embeddingToBlob(emb: Float32Array): Buffer {
  return Buffer.from(emb.buffer);
}

async function embedTable(tableName: string, contentQuery: string): Promise<number> {
  let total = 0;
  let errors = 0;
  const batchSize = 25;

  // Get IDs that need embedding
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db.prepare(`
    SELECT t.id, ${contentQuery} as content
    FROM ${tableName} t
    LEFT JOIN embeddings e ON e.source_table = '${tableName}' AND e.source_id = t.id
    WHERE e.id IS NULL
  `).all() as any[];
  db.close();

  console.log(`  ${tableName}: ${rows.length} to embed`);
  if (rows.length === 0) return 0;

  // Process in batches of 25, open/close DB per batch, retry on lock
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const embeddings: Array<{ source_id: number; blob: Buffer }> = [];

    for (const row of batch) {
      const emb = await embed(row.content || '');
      if (emb) {
        embeddings.push({ source_id: row.id, blob: embeddingToBlob(emb) });
      } else {
        errors++;
      }
    }

    if (embeddings.length > 0) {
      for (let retry = 0; retry < 3; retry++) {
        try {
          const writeDb = new Database(DB_PATH);
          writeDb.run('PRAGMA journal_mode=WAL');
          writeDb.run('PRAGMA busy_timeout=10000');
          const insert = writeDb.prepare(
            `INSERT OR IGNORE INTO embeddings (source_table, source_id, model, dimensions, embedding) VALUES (?, ?, ?, ?, ?)`
          );
          const tx = writeDb.transaction(() => {
            for (const e of embeddings) {
              insert.run(tableName, e.source_id, EMBED_MODEL, 768, e.blob);
            }
          });
          tx();
          writeDb.close();
          total += embeddings.length;
          break; // success
        } catch (err: any) {
          if (retry < 2 && err.message?.includes('locked')) {
            await new Promise(r => setTimeout(r, 2000 * (retry + 1)));
          } else {
            console.error(`  DB write failed after retries: ${err.message}`);
          }
        }
      }
    }

    if ((i + batchSize) % 500 < batchSize || i + batchSize >= rows.length) {
      console.log(`  ${tableName}: ${Math.min(i + batchSize, rows.length)}/${rows.length} (${errors} errors)`);
    }
  }

  return total;
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  EMBEDDING GENERATION — via spark GPU        ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Ensure embeddings table exists
  const db = new Database(DB_PATH);
  db.run('PRAGMA journal_mode=WAL');
  db.run(`CREATE TABLE IF NOT EXISTS embeddings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_table TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    model TEXT NOT NULL DEFAULT 'nomic-embed-text',
    dimensions INTEGER NOT NULL DEFAULT 768,
    embedding BLOB NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_table, source_id)
  )`);

  const existing = (db.prepare('SELECT COUNT(*) as cnt FROM embeddings').get() as any).cnt;
  console.log(`Existing embeddings: ${existing}\n`);
  db.close();

  let total = 0;

  total += await embedTable('messages', 'content');
  total += await embedTable('loa_entries', "title || ' ' || fabric_extract");
  total += await embedTable('decisions', "decision || ' ' || COALESCE(reasoning, '')");
  total += await embedTable('learnings', "problem || ' ' || COALESCE(solution, '')");
  total += await embedTable('errors', "error || ' ' || COALESCE(fix, '')");

  console.log(`\nNew embeddings generated: ${total}`);
  console.log(`Total embeddings: ${existing + total}`);

  const size = statSync(DB_PATH).size;
  console.log(`Database size: ${(size / 1024 / 1024).toFixed(1)} MB`);
  console.log('\n✅ EMBEDDING COMPLETE');
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
