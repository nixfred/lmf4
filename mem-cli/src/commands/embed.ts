// mem embed command - Generate and store embeddings for semantic search

import { getDb } from '../db/connection.js';
import { embed, embeddingToBlob, blobToEmbedding, cosineSimilarity, checkEmbeddingService, reciprocalRankFusion, EMBEDDING_MODEL } from '../lib/embeddings.js';
import { search as ftsSearch } from '../lib/memory.js';

interface EmbedOptions {
  table?: 'loa' | 'decisions' | 'messages';
  limit?: number;
  force?: boolean;
}

/**
 * Get content to embed for a given table
 */
function getContentForTable(table: string, row: any): string {
  switch (table) {
    case 'loa':
      return `${row.title}\n\n${row.fabric_extract}`;
    case 'decisions':
      return `${row.decision}\n\nReasoning: ${row.reasoning || 'N/A'}`;
    case 'messages':
      return row.content;
    default:
      return row.content || row.text || '';
  }
}

/**
 * Backfill embeddings for a table
 */
export async function runEmbedBackfill(options: EmbedOptions): Promise<void> {
  const db = getDb();
  const table = options.table || 'loa';
  const limit = options.limit || 100;

  // Check embedding service
  console.log('Checking embedding service...');
  const serviceStatus = await checkEmbeddingService();

  if (!serviceStatus.available) {
    console.error(`\nError: Embedding service not available at ${serviceStatus.url}`);
    console.error(`Make sure Ollama is running with the ${serviceStatus.model} model.`);
    console.error(`\nTo install locally:`);
    console.error(`  1. Install Ollama:  https://ollama.com/download`);
    console.error(`  2. Pull the model:  ollama pull ${serviceStatus.model}`);
    console.error(`\nOr point at a remote Ollama: OLLAMA_URL=http://host:11434 mem embed backfill`);
    process.exit(1);
  }

  console.log(`✓ Embedding service available (${serviceStatus.model} @ ${serviceStatus.url})\n`);

  // Get rows to embed
  let sourceTable: string;
  let query: string;

  switch (table) {
    case 'loa':
      sourceTable = 'loa_entries';
      query = options.force
        ? `SELECT id, title, fabric_extract FROM loa_entries ORDER BY created_at DESC LIMIT ?`
        : `SELECT l.id, l.title, l.fabric_extract FROM loa_entries l
           LEFT JOIN embeddings e ON e.source_table = 'loa_entries' AND e.source_id = l.id
           WHERE e.id IS NULL
           ORDER BY l.created_at DESC LIMIT ?`;
      break;
    case 'decisions':
      sourceTable = 'decisions';
      query = options.force
        ? `SELECT id, decision, reasoning FROM decisions ORDER BY created_at DESC LIMIT ?`
        : `SELECT d.id, d.decision, d.reasoning FROM decisions d
           LEFT JOIN embeddings e ON e.source_table = 'decisions' AND e.source_id = d.id
           WHERE e.id IS NULL
           ORDER BY d.created_at DESC LIMIT ?`;
      break;
    case 'messages':
      sourceTable = 'messages';
      query = options.force
        ? `SELECT id, content FROM messages WHERE role = 'assistant' ORDER BY timestamp DESC LIMIT ?`
        : `SELECT m.id, m.content FROM messages m
           LEFT JOIN embeddings e ON e.source_table = 'messages' AND e.source_id = m.id
           WHERE e.id IS NULL AND m.role = 'assistant'
           ORDER BY m.timestamp DESC LIMIT ?`;
      break;
    default:
      console.error(`Unknown table: ${table}`);
      process.exit(1);
  }

  const rows = db.prepare(query).all(limit) as any[];

  if (rows.length === 0) {
    console.log(`No ${table} entries to embed (all already embedded or none exist).`);
    return;
  }

  console.log(`Embedding ${rows.length} ${table} entries...\n`);

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO embeddings (source_table, source_id, model, dimensions, embedding)
    VALUES (?, ?, ?, ?, ?)
  `);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const content = getContentForTable(table, row);

    // Skip empty content
    if (!content || content.trim().length < 10) {
      console.log(`  [${i + 1}/${rows.length}] Skipping #${row.id} (empty content)`);
      failed++;
      continue;
    }

    try {
      process.stdout.write(`  [${i + 1}/${rows.length}] Embedding #${row.id}... `);

      const result = await embed(content);
      const blob = embeddingToBlob(result.embedding);

      insertStmt.run(sourceTable, row.id, result.model, result.dimensions, blob);

      console.log(`✓ (${result.dimensions}d)`);
      success++;
    } catch (err) {
      console.log(`✗ ${err instanceof Error ? err.message : err}`);
      failed++;
    }
  }

  console.log(`\nDone: ${success} embedded, ${failed} failed`);
}

/**
 * Semantic search using embeddings
 */
export async function runSemanticSearch(query: string, options: { table?: string; limit?: number }): Promise<void> {
  const db = getDb();
  const limit = options.limit || 10;

  // Check embedding service
  const serviceStatus = await checkEmbeddingService();
  if (!serviceStatus.available) {
    console.error(`Error: Embedding service not available at ${serviceStatus.url}`);
    process.exit(1);
  }

  console.log(`Searching for: "${query}"\n`);

  // Embed the query
  const queryResult = await embed(query);
  const queryEmbedding = queryResult.embedding;

  // Get all embeddings (for now, brute force - will optimize later)
  const tableFilter = options.table ? `WHERE source_table = '${options.table}'` : '';
  const embeddings = db.prepare(`
    SELECT id, source_table, source_id, embedding
    FROM embeddings
    ${tableFilter}
  `).all() as Array<{ id: number; source_table: string; source_id: number; embedding: Buffer }>;

  if (embeddings.length === 0) {
    console.log('No embeddings found. Run `mem embed --backfill` first.');
    return;
  }

  // Calculate similarities
  const results: Array<{ source_table: string; source_id: number; similarity: number }> = [];

  for (const row of embeddings) {
    const embedding = blobToEmbedding(row.embedding);
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    results.push({
      source_table: row.source_table,
      source_id: row.source_id,
      similarity
    });
  }

  // Sort by similarity (descending)
  results.sort((a, b) => b.similarity - a.similarity);

  // Display top results
  console.log(`Found ${results.length} embeddings, showing top ${limit}:\n`);

  for (let i = 0; i < Math.min(limit, results.length); i++) {
    const r = results[i];
    const score = (r.similarity * 100).toFixed(1);

    // Get preview of content
    let preview = '';
    let meta = '';

    if (r.source_table === 'loa_entries') {
      const loa = db.prepare('SELECT title, fabric_extract FROM loa_entries WHERE id = ?').get(r.source_id) as any;
      if (loa) {
        preview = loa.title;
        meta = `[LoA #${r.source_id}]`;
      }
    } else if (r.source_table === 'decisions') {
      const dec = db.prepare('SELECT decision FROM decisions WHERE id = ?').get(r.source_id) as any;
      if (dec) {
        preview = dec.decision.slice(0, 80);
        meta = `[Decision #${r.source_id}]`;
      }
    } else if (r.source_table === 'messages') {
      const msg = db.prepare('SELECT content, project FROM messages WHERE id = ?').get(r.source_id) as any;
      if (msg) {
        preview = msg.content.slice(0, 80).replace(/\n/g, ' ');
        meta = `[Message #${r.source_id}]`;
      }
    }

    console.log(`${score}% ${meta} ${preview}...`);
  }
}

/**
 * Show embedding stats
 */
export function runEmbedStats(): void {
  const db = getDb();

  console.log('Embedding Statistics');
  console.log('====================\n');

  // Count by table
  const stats = db.prepare(`
    SELECT source_table, COUNT(*) as count, model
    FROM embeddings
    GROUP BY source_table, model
  `).all() as Array<{ source_table: string; count: number; model: string }>;

  if (stats.length === 0) {
    console.log('No embeddings yet. Run `mem embed --backfill --table loa` to start.');
    return;
  }

  for (const s of stats) {
    console.log(`${s.source_table}: ${s.count} (${s.model})`);
  }

  // Total
  const total = stats.reduce((sum, s) => sum + s.count, 0);
  console.log(`\nTotal: ${total} embeddings`);

  // Storage size
  const sizeResult = db.prepare(`
    SELECT SUM(LENGTH(embedding)) as bytes FROM embeddings
  `).get() as { bytes: number };

  if (sizeResult.bytes) {
    const mb = (sizeResult.bytes / 1024 / 1024).toFixed(2);
    console.log(`Storage: ${mb} MB`);
  }
}

/**
 * Hybrid search combining FTS5 keywords + vector semantics with RRF fusion
 */
export async function runHybridSearch(query: string, options: { table?: string; limit?: number }): Promise<void> {
  const db = getDb();
  const limit = options.limit || 10;

  // Check embedding service
  const serviceStatus = await checkEmbeddingService();
  if (!serviceStatus.available) {
    console.error(`Error: Embedding service not available at ${serviceStatus.url}`);
    console.error('Falling back to keyword-only search...\n');
    // Fall back to FTS5 only
    const ftsResults = ftsSearch(query, { table: options.table === 'loa_entries' ? 'loa' : options.table, limit });
    console.log(`Keyword search results (${ftsResults.length}):\n`);
    for (const r of ftsResults) {
      console.log(`[${r.table} #${r.id}] ${r.content?.slice(0, 80)}...`);
    }
    return;
  }

  console.log(`Hybrid search for: "${query}"\n`);
  console.log('Running keyword search (FTS5)...');

  // 1. FTS5 keyword search
  const ftsTable = options.table === 'loa_entries' ? 'loa' : options.table;
  const ftsResults = ftsSearch(query, { table: ftsTable, limit: limit * 2 }); // Get more for fusion

  console.log(`  Found ${ftsResults.length} keyword matches`);

  // 2. Semantic search
  console.log('Running semantic search (embeddings)...');

  const queryResult = await embed(query);
  const queryEmbedding = queryResult.embedding;

  // Get embeddings from database
  const tableFilter = options.table ? `WHERE source_table = '${options.table}'` : '';
  const embeddings = db.prepare(`
    SELECT id, source_table, source_id, embedding
    FROM embeddings
    ${tableFilter}
  `).all() as Array<{ id: number; source_table: string; source_id: number; embedding: Buffer }>;

  // Calculate similarities
  const semanticResults: Array<{ source_table: string; source_id: number; similarity: number }> = [];

  for (const row of embeddings) {
    const embedding = blobToEmbedding(row.embedding);
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    semanticResults.push({
      source_table: row.source_table,
      source_id: row.source_id,
      similarity
    });
  }

  // Sort by similarity (descending)
  semanticResults.sort((a, b) => b.similarity - a.similarity);
  const topSemantic = semanticResults.slice(0, limit * 2);

  console.log(`  Found ${embeddings.length} embeddings, top ${topSemantic.length} by similarity\n`);

  // 3. Apply Reciprocal Rank Fusion
  console.log('Applying Reciprocal Rank Fusion (RRF)...\n');

  // Convert to common format for RRF: "table:id"
  const ftsRanked = ftsResults.map(r => ({
    id: `${r.table === 'loa' ? 'loa_entries' : r.table}:${r.id}`,
    score: r.rank
  }));

  const semanticRanked = topSemantic.map(r => ({
    id: `${r.source_table}:${r.source_id}`,
    score: r.similarity
  }));

  // Apply RRF
  const fusedScores = reciprocalRankFusion([ftsRanked, semanticRanked]);

  // Sort by fused score (descending)
  const sortedResults = Array.from(fusedScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  // Display results with source indicators
  console.log(`Top ${sortedResults.length} hybrid results:\n`);
  console.log('Score   | Source      | Preview');
  console.log('--------|-------------|' + '-'.repeat(60));

  for (const [key, score] of sortedResults) {
    const [table, idStr] = key.split(':');
    const id = parseInt(idStr, 10);

    // Check which lists this result appeared in
    const inFts = ftsRanked.some(r => r.id === key);
    const inSemantic = semanticRanked.some(r => r.id === key);
    const sourceIndicator = inFts && inSemantic ? 'FTS+VEC' : inFts ? 'FTS   ' : 'VEC   ';

    // Get preview
    let preview = '';
    let meta = '';

    if (table === 'loa_entries') {
      const loa = db.prepare('SELECT title FROM loa_entries WHERE id = ?').get(id) as { title: string } | undefined;
      if (loa) {
        preview = loa.title;
        meta = `LoA #${id}`;
      }
    } else if (table === 'decisions') {
      const dec = db.prepare('SELECT decision FROM decisions WHERE id = ?').get(id) as { decision: string } | undefined;
      if (dec) {
        preview = dec.decision.slice(0, 50);
        meta = `Decision #${id}`;
      }
    } else if (table === 'messages') {
      const msg = db.prepare('SELECT content FROM messages WHERE id = ?').get(id) as { content: string } | undefined;
      if (msg) {
        preview = msg.content.slice(0, 50).replace(/\n/g, ' ');
        meta = `Message #${id}`;
      }
    } else if (table === 'learnings') {
      const learn = db.prepare('SELECT problem FROM learnings WHERE id = ?').get(id) as { problem: string } | undefined;
      if (learn) {
        preview = learn.problem.slice(0, 50);
        meta = `Learning #${id}`;
      }
    } else if (table === 'breadcrumbs') {
      const bc = db.prepare('SELECT content FROM breadcrumbs WHERE id = ?').get(id) as { content: string } | undefined;
      if (bc) {
        preview = bc.content.slice(0, 50);
        meta = `Breadcrumb #${id}`;
      }
    }

    const scoreStr = (score * 100).toFixed(2).padStart(6);
    console.log(`${scoreStr}% | ${sourceIndicator} | [${meta}] ${preview}...`);
  }

  // Summary stats
  const bothCount = sortedResults.filter(([key]) => {
    return ftsRanked.some(r => r.id === key) && semanticRanked.some(r => r.id === key);
  }).length;

  console.log(`\n--- Fusion Summary ---`);
  console.log(`Results in both FTS + Vector: ${bothCount}`);
  console.log(`FTS5-only contributions: ${sortedResults.filter(([key]) => ftsRanked.some(r => r.id === key) && !semanticRanked.some(r => r.id === key)).length}`);
  console.log(`Vector-only contributions: ${sortedResults.filter(([key]) => !ftsRanked.some(r => r.id === key) && semanticRanked.some(r => r.id === key)).length}`);
}
