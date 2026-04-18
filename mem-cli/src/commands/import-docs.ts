// Import standalone markdown documents into the database
// mem docs import [--dry-run] [--yes]

import { existsSync, readFileSync, statSync, readdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { getDb } from '../db/connection.js';

const LMF_BASE_DIR = process.env.LMF_BASE_DIR || join(homedir(), '.claude');

interface DocFile {
  path: string;
  title: string;
  type: 'diary' | 'reference' | 'wisdom' | 'plan' | 'memory' | 'enterprise' | 'other';
  content: string;
  summary: string | null;
  sizeBytes: number;
  fileModifiedAt: Date;
}

// Define document sources to import
// Users can customize this list to match their setup
const DOCUMENT_SOURCES: { pattern: string; type: DocFile['type']; minSize?: number }[] = [
  // Memory directory files (created by LMF3 extraction pipeline)
  { pattern: 'MEMORY/DISTILLED.md', type: 'memory' },
  { pattern: 'MEMORY/DECISIONS.log', type: 'memory' },
  { pattern: 'MEMORY/REJECTIONS.log', type: 'memory' },
  { pattern: 'MEMORY/HOT_RECALL.md', type: 'memory' },

  // Plans
  { pattern: 'plans/*.md', type: 'plan' },

  // Wisdom extracts (from Fabric extract_wisdom)
  { pattern: 'History/wisdom/**/*_wisdom.md', type: 'wisdom' },
];

function extractTitle(content: string, filename: string): string {
  // Try to extract title from first heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  // Try to extract from **Title:** pattern
  const boldTitleMatch = content.match(/\*\*(?:Title|Name):\*\*\s*(.+)/i);
  if (boldTitleMatch) return boldTitleMatch[1].trim();

  // Fall back to filename
  return basename(filename, '.md').replace(/[-_]/g, ' ');
}

function extractSummary(content: string): string | null {
  // Try to extract purpose or summary
  const purposeMatch = content.match(/\*\*Purpose:\*\*\s*(.+)/i);
  if (purposeMatch) return purposeMatch[1].trim();

  // Try first paragraph after title
  const lines = content.split('\n');
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const line = lines[i].trim();
    if (line && !line.startsWith('#') && !line.startsWith('*') && !line.startsWith('-') && line.length > 30) {
      return line.substring(0, 200);
    }
  }

  return null;
}

function findFiles(baseDir: string, pattern: string): string[] {
  const results: string[] = [];

  if (pattern.includes('*')) {
    // Handle glob patterns
    const parts = pattern.split('/');
    const dirPart = parts.slice(0, -1).join('/');
    const filePart = parts[parts.length - 1];

    const searchDir = join(baseDir, dirPart);
    if (!existsSync(searchDir)) return results;

    const searchRecursively = (dir: string) => {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory() && pattern.includes('**')) {
            searchRecursively(fullPath);
          } else if (entry.isFile()) {
            if (filePart === '*.md' && entry.name.endsWith('.md')) {
              results.push(fullPath);
            } else if (filePart.includes('*') && entry.name.endsWith('.md') && entry.name.includes(filePart.replace('*', '').replace('.md', ''))) {
              results.push(fullPath);
            }
          }
        }
      } catch (e) {
        // Ignore permission errors
      }
    };

    searchRecursively(searchDir);
  } else {
    // Direct file path
    const fullPath = join(baseDir, pattern);
    if (existsSync(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}

function collectDocuments(): DocFile[] {
  const docs: DocFile[] = [];
  const seen = new Set<string>();

  for (const source of DOCUMENT_SOURCES) {
    const files = findFiles(LMF_BASE_DIR, source.pattern);

    for (const filePath of files) {
      if (seen.has(filePath)) continue;
      seen.add(filePath);

      try {
        const stats = statSync(filePath);
        const minSize = source.minSize || 500;

        if (stats.size < minSize) continue;

        const content = readFileSync(filePath, 'utf-8');
        const relativePath = filePath.replace(LMF_BASE_DIR + '/', '');

        docs.push({
          path: relativePath,
          title: extractTitle(content, filePath),
          type: source.type,
          content,
          summary: extractSummary(content),
          sizeBytes: stats.size,
          fileModifiedAt: stats.mtime,
        });
      } catch (e) {
        // Skip unreadable files
      }
    }
  }

  return docs;
}

export function runImportDocs(options: { dryRun?: boolean; yes?: boolean; verbose?: boolean }): void {
  console.log('Import Standalone Documents');
  console.log('===========================\n');

  const docs = collectDocuments();
  console.log(`Found ${docs.length} documents to import\n`);

  if (docs.length === 0) {
    console.log('No documents found to import.');
    return;
  }

  const db = getDb();

  // Check existing documents
  const existing = new Set<string>();
  const existingRows = db.prepare('SELECT path FROM documents').all() as { path: string }[];
  for (const row of existingRows) {
    existing.add(row.path);
  }

  const toInsert: DocFile[] = [];
  const toUpdate: DocFile[] = [];

  for (const doc of docs) {
    if (existing.has(doc.path)) {
      toUpdate.push(doc);
    } else {
      toInsert.push(doc);
    }
  }

  // Show what will be imported
  if (options.verbose || options.dryRun) {
    for (const doc of toInsert) {
      console.log(`[NEW] ${doc.type}: ${doc.title} (${(doc.sizeBytes / 1024).toFixed(1)}KB)`);
    }
    for (const doc of toUpdate) {
      console.log(`[UPDATE] ${doc.type}: ${doc.title} (${(doc.sizeBytes / 1024).toFixed(1)}KB)`);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  New documents:    ${toInsert.length}`);
  console.log(`  To update:        ${toUpdate.length}`);
  console.log(`  Already exists:   ${existing.size - toUpdate.length}`);

  if (options.dryRun) {
    console.log('\n[DRY RUN] Would import/update the above documents.');
    return;
  }

  if (!options.yes && toInsert.length + toUpdate.length > 0) {
    console.log('\nRun with --yes to import, or --dry-run to preview.');
    return;
  }

  // Perform import
  console.log('\nImporting...\n');

  const insertStmt = db.prepare(`
    INSERT INTO documents (path, title, type, content, summary, size_bytes, file_modified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const updateStmt = db.prepare(`
    UPDATE documents
    SET title = ?, type = ?, content = ?, summary = ?, size_bytes = ?, file_modified_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE path = ?
  `);

  let imported = 0;
  let updated = 0;
  let errors = 0;

  for (const doc of toInsert) {
    try {
      insertStmt.run(
        doc.path,
        doc.title,
        doc.type,
        doc.content,
        doc.summary,
        doc.sizeBytes,
        doc.fileModifiedAt.toISOString()
      );
      console.log(`✓ Imported: ${doc.title}`);
      imported++;
    } catch (e: any) {
      console.log(`✗ Error importing ${doc.path}: ${e.message}`);
      errors++;
    }
  }

  for (const doc of toUpdate) {
    try {
      updateStmt.run(
        doc.title,
        doc.type,
        doc.content,
        doc.summary,
        doc.sizeBytes,
        doc.fileModifiedAt.toISOString(),
        doc.path
      );
      console.log(`✓ Updated: ${doc.title}`);
      updated++;
    } catch (e: any) {
      console.log(`✗ Error updating ${doc.path}: ${e.message}`);
      errors++;
    }
  }

  console.log('\nImport Complete');
  console.log('===============');
  console.log(`  Imported: ${imported}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Errors:   ${errors}`);
}

export function runDocsList(): void {
  const db = getDb();
  const docs = db.prepare(`
    SELECT id, path, title, type, size_bytes, created_at
    FROM documents
    ORDER BY type, title
  `).all() as { id: number; path: string; title: string; type: string; size_bytes: number; created_at: string }[];

  console.log(`Documents in LMF (${docs.length} total):\n`);

  let currentType = '';
  for (const doc of docs) {
    if (doc.type !== currentType) {
      currentType = doc.type;
      console.log(`\n[${currentType.toUpperCase()}]`);
    }
    const sizeKB = (doc.size_bytes / 1024).toFixed(1);
    console.log(`  #${doc.id} ${doc.title} (${sizeKB}KB)`);
  }
}

export function runDocsSearch(query: string, limit: number = 10): void {
  const db = getDb();
  const results = db.prepare(`
    SELECT d.id, d.path, d.title, d.type, d.size_bytes,
           snippet(documents_fts, 2, '**', '**', '...', 40) as snippet
    FROM documents_fts f
    JOIN documents d ON d.id = f.rowid
    WHERE documents_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as { id: number; path: string; title: string; type: string; size_bytes: number; snippet: string }[];

  console.log(`Found ${results.length} document(s) for "${query}":\n`);

  for (const doc of results) {
    console.log(`**${doc.title}** (${doc.type})`);
    console.log(`  ${doc.snippet}`);
    console.log('');
  }
}

export function runDocsShow(id: number): void {
  const db = getDb();
  const doc = db.prepare(`
    SELECT * FROM documents WHERE id = ?
  `).get(id) as { id: number; path: string; title: string; type: string; content: string; summary: string; size_bytes: number; created_at: string } | undefined;

  if (!doc) {
    console.log(`Document #${id} not found.`);
    return;
  }

  console.log(`Document #${doc.id}: ${doc.title}`);
  console.log(`${'='.repeat(40)}`);
  console.log(`Type: ${doc.type}`);
  console.log(`Path: ${doc.path}`);
  console.log(`Size: ${(doc.size_bytes / 1024).toFixed(1)} KB`);
  console.log(`Imported: ${doc.created_at}`);
  if (doc.summary) {
    console.log(`Summary: ${doc.summary}`);
  }
  console.log(`\n--- Content Preview (first 2000 chars) ---\n`);
  console.log(doc.content.substring(0, 2000));
  if (doc.content.length > 2000) {
    console.log('\n... [truncated]');
  }
}
