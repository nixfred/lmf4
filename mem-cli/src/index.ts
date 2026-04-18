#!/usr/bin/env node

// LMF - Persistent AI Memory System
// CLI entry point

import { Command } from 'commander';
import { VERSION, DISPLAY_NAME } from './version.js';
import { runInit } from './commands/init.js';
import { runAddBreadcrumb, runAddDecision, runAddLearning } from './commands/add.js';
import { runSearch } from './commands/search.js';
import { runRecent } from './commands/recent.js';
import { runShow } from './commands/show.js';
import { runStats } from './commands/stats.js';
import { runImport } from './commands/import.js';
import { runLoa, runLoaQuote, runLoaShow, runLoaList } from './commands/loa.js';
import { runDump } from './commands/dump.js';
import { runImportLegacy } from './commands/import-legacy.js';
import { runImportDocs, runDocsList, runDocsSearch, runDocsShow } from './commands/import-docs.js';
import { runCatchup } from './commands/catchup.js';
import { runEmbedBackfill, runSemanticSearch, runEmbedStats, runHybridSearch } from './commands/embed.js';
import { closeDb } from './db/connection.js';

const program = new Command();

program
  .name('mem')
  .description(`${DISPLAY_NAME} - Persistent AI Memory System`)
  .version(VERSION)
  .enablePositionalOptions();

// mem init
program
  .command('init')
  .description('Initialize the memory database')
  .action(() => {
    runInit();
    closeDb();
  });

// mem add breadcrumb
const addCmd = program
  .command('add')
  .description('Add a memory record');

addCmd
  .command('breadcrumb <content>')
  .description('Add a breadcrumb (context, note, reference)')
  .option('-p, --project <name>', 'Project name')
  .option('-c, --category <cat>', 'Category (context, note, todo, reference)')
  .option('-i, --importance <n>', 'Importance 1-10', '5')
  .action((content, options) => {
    runAddBreadcrumb(content, {
      project: options.project,
      category: options.category,
      importance: parseInt(options.importance, 10)
    });
    closeDb();
  });

addCmd
  .command('decision <decision>')
  .description('Record a decision')
  .option('-p, --project <name>', 'Project name')
  .option('-c, --category <cat>', 'Category (architecture, tooling, process)')
  .option('-w, --why <reasoning>', 'Why this decision was made')
  .option('-a, --alternatives <alt>', 'Alternatives considered')
  .action((decision, options) => {
    runAddDecision(decision, {
      project: options.project,
      category: options.category,
      why: options.why,
      alternatives: options.alternatives
    });
    closeDb();
  });

addCmd
  .command('learning <problem> <solution>')
  .description('Record a learning (problem + solution)')
  .option('-p, --project <name>', 'Project name')
  .option('-c, --category <cat>', 'Category (error, pattern, optimization)')
  .option('--prevention <text>', 'How to prevent in future')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .action((problem, solution, options) => {
    runAddLearning(problem, solution, {
      project: options.project,
      category: options.category,
      prevention: options.prevention,
      tags: options.tags
    });
    closeDb();
  });

// mem search
program
  .command('search <query>')
  .description('Full-text search across all memory')
  .option('-p, --project <name>', 'Filter by project')
  .option('-t, --table <table>', 'Search specific table (messages, decisions, learnings, breadcrumbs)')
  .option('-l, --limit <n>', 'Max results', '20')
  .action((query, options) => {
    runSearch(query, {
      project: options.project,
      table: options.table,
      limit: parseInt(options.limit, 10)
    });
    closeDb();
  });

// mem recent
program
  .command('recent [table]')
  .description('Show recent records (messages, decisions, learnings, breadcrumbs, all)')
  .option('-p, --project <name>', 'Filter by project')
  .option('-l, --limit <n>', 'Max results', '10')
  .action((table, options) => {
    runRecent(table, {
      project: options.project,
      limit: parseInt(options.limit, 10)
    });
    closeDb();
  });

// mem show
program
  .command('show <table> <id>')
  .description('Show full details of a record')
  .action((table, id) => {
    runShow(table, parseInt(id, 10));
    closeDb();
  });

// mem stats
program
  .command('stats')
  .description('Show database statistics')
  .action(() => {
    runStats();
    closeDb();
  });

// mem import
program
  .command('import')
  .description('Import conversations from Claude Code session files')
  .option('--dry-run', 'Preview what would be imported without making changes')
  .option('-v, --verbose', 'Show detailed progress')
  .option('-y, --yes', 'Confirm import (required to actually import)')
  .action((options) => {
    runImport({
      dryRun: options.dryRun,
      verbose: options.verbose,
      yes: options.yes
    });
    closeDb();
  });

// mem loa - Library of Alexandria
const loaCmd = program
  .command('loa')
  .description('Library of Alexandria - curated knowledge capture');

loaCmd
  .command('write <title>')
  .description('Capture messages since last LoA entry (extracted via claude --print)')
  .option('-p, --project <name>', 'Project name')
  .option('-c, --continues <id>', 'Continue from a previous LoA entry')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-n, --limit <n>', 'Max messages to process (default: all since last LoA)')
  .action(async (title, options) => {
    await runLoa(title, {
      project: options.project,
      continues: options.continues ? parseInt(options.continues, 10) : undefined,
      tags: options.tags,
      limit: options.limit ? parseInt(options.limit, 10) : undefined
    });
    closeDb();
  });

loaCmd
  .command('show <id>')
  .description('Show full LoA entry with its extract')
  .action((id) => {
    runLoaShow(parseInt(id, 10));
    closeDb();
  });

loaCmd
  .command('quote <id>')
  .description('Show the raw source messages for an LoA entry')
  .action((id) => {
    runLoaQuote(parseInt(id, 10));
    closeDb();
  });

loaCmd
  .command('list')
  .description('List recent LoA entries')
  .option('-l, --limit <n>', 'Max entries', '10')
  .action((options) => {
    runLoaList(parseInt(options.limit, 10));
    closeDb();
  });

// mem import-legacy - Import DISTILLED.md extracts
program
  .command('import-legacy')
  .description('Import legacy DISTILLED.md extracts as LoA entries')
  .option('--dry-run', 'Preview what would be imported')
  .option('-v, --verbose', 'Show detailed progress')
  .option('-y, --yes', 'Confirm import')
  .option('-s, --source <source>', 'Source: distilled, hot_recall, or all', 'all')
  .action((options) => {
    runImportLegacy({
      dryRun: options.dryRun,
      verbose: options.verbose,
      yes: options.yes,
      source: options.source
    });
    closeDb();
  });

// mem catchup - Batch extraction of unprocessed sessions (wired to systemd timer)
program
  .command('catchup')
  .description('Extract any unprocessed session transcripts (idempotent; safe to run often)')
  .option('-f, --force', 'Re-extract all sessions, even already-extracted ones')
  .action(async (options) => {
    await runCatchup({ force: !!options.force });
    closeDb();
  });

// mem dump - Flush current session + capture LoA
program
  .command('dump <title>')
  .description('Flush current session to DB and capture LoA entry')
  .option('-p, --project <name>', 'Project name')
  .option('-c, --continues <id>', 'Continue from a previous LoA entry')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-n, --limit <n>', 'Max messages to process')
  .option('--skip-fabric', 'Skip extraction (import only; option kept for LMF3 compat)')
  .action(async (title, options) => {
    await runDump(title, {
      project: options.project,
      continues: options.continues ? parseInt(options.continues, 10) : undefined,
      tags: options.tags,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      skipFabric: options.skipFabric
    });
    closeDb();
  });

// mem docs - Standalone document management
const docsCmd = program
  .command('docs')
  .description('Standalone documents - diary, reference, wisdom files');

docsCmd
  .command('import')
  .description('Import standalone markdown documents from ~/.claude/')
  .option('--dry-run', 'Preview what would be imported')
  .option('-v, --verbose', 'Show detailed progress')
  .option('-y, --yes', 'Confirm import')
  .action((options) => {
    runImportDocs({
      dryRun: options.dryRun,
      verbose: options.verbose,
      yes: options.yes
    });
    closeDb();
  });

docsCmd
  .command('list')
  .description('List imported documents')
  .action(() => {
    runDocsList();
    closeDb();
  });

docsCmd
  .command('search <query>')
  .description('Search documents')
  .option('-l, --limit <n>', 'Max results', '10')
  .action((query, options) => {
    runDocsSearch(query, parseInt(options.limit, 10));
    closeDb();
  });

docsCmd
  .command('show <id>')
  .description('Show a document')
  .action((id) => {
    runDocsShow(parseInt(id, 10));
    closeDb();
  });

// mem embed - Vector embeddings for semantic search
const embedCmd = program
  .command('embed')
  .description('Vector embeddings for semantic search');

embedCmd
  .command('backfill')
  .description('Generate embeddings for existing records')
  .option('-t, --table <table>', 'Table to embed: loa, decisions, messages', 'loa')
  .option('-l, --limit <n>', 'Max records to embed', '100')
  .option('-f, --force', 'Re-embed even if already embedded')
  .action(async (options) => {
    await runEmbedBackfill({
      table: options.table as 'loa' | 'decisions' | 'messages',
      limit: parseInt(options.limit, 10),
      force: options.force
    });
    closeDb();
  });

embedCmd
  .command('stats')
  .description('Show embedding statistics')
  .action(() => {
    runEmbedStats();
    closeDb();
  });

// mem semantic <query> - Semantic search
program
  .command('semantic <query>')
  .description('Semantic search using vector embeddings')
  .option('-t, --table <table>', 'Search specific table (loa_entries, decisions, messages)')
  .option('-l, --limit <n>', 'Max results', '10')
  .action(async (query, options) => {
    await runSemanticSearch(query, {
      table: options.table,
      limit: parseInt(options.limit, 10)
    });
    closeDb();
  });

// mem hybrid <query> - Hybrid search (FTS5 + semantic with RRF fusion)
program
  .command('hybrid <query>')
  .description('Hybrid search combining keywords (FTS5) + semantics (embeddings) with RRF fusion')
  .option('-t, --table <table>', 'Search specific table (loa_entries, decisions, messages)')
  .option('-l, --limit <n>', 'Max results', '10')
  .action(async (query, options) => {
    await runHybridSearch(query, {
      table: options.table,
      limit: parseInt(options.limit, 10)
    });
    closeDb();
  });

// Default command: mem <query> → hybrid search (Phase 3: best of both worlds)
program
  .arguments('[query]')
  .option('-p, --project <name>', 'Filter by project')
  .option('-t, --table <table>', 'Search specific table')
  .option('-l, --limit <n>', 'Max results', '10')
  .option('-k, --keyword', 'Use keyword search only (FTS5)')
  .option('-v, --vector', 'Use vector search only (semantic)')
  .action(async (query, options) => {
    if (query && !['init', 'add', 'search', 'recent', 'show', 'stats', 'import', 'loa', 'docs', 'dump', 'embed', 'semantic', 'hybrid', 'catchup', 'import-legacy'].includes(query)) {
      if (options.keyword) {
        // FTS5 only
        runSearch(query, {
          project: options.project,
          table: options.table,
          limit: parseInt(options.limit, 10)
        });
      } else if (options.vector) {
        // Semantic only
        await runSemanticSearch(query, {
          table: options.table,
          limit: parseInt(options.limit, 10)
        });
      } else {
        // Default: hybrid (best results)
        await runHybridSearch(query, {
          table: options.table,
          limit: parseInt(options.limit, 10)
        });
      }
      closeDb();
    }
  });

// Parse and run
program.parse();
