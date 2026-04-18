// mem import command

import { importAllSessions, previewImport } from '../lib/import.js';

interface ImportOptions {
  dryRun?: boolean;
  verbose?: boolean;
  yes?: boolean;
}

export function runImport(options: ImportOptions): void {
  // First, preview what will be imported
  const preview = previewImport();

  console.log('Import Preview');
  console.log('==============\n');

  console.log(`Session files found: ${preview.total}`);
  console.log(`  Already imported:  ${preview.existing}`);
  console.log(`  New to import:     ${preview.new}\n`);

  if (preview.new === 0) {
    console.log('Nothing new to import.');
    return;
  }

  if (options.dryRun) {
    console.log('[DRY RUN] Would import the following sessions:\n');

    const result = importAllSessions({ dryRun: true, verbose: true });

    console.log('\n[DRY RUN] Summary:');
    console.log(`  Sessions: ${result.sessionsImported}`);
    console.log(`  Messages: ${result.messagesImported}`);
    return;
  }

  if (!options.yes) {
    console.log('Run with --yes to confirm import, or --dry-run to preview.');
    return;
  }

  console.log('Importing sessions...\n');

  const result = importAllSessions({ verbose: options.verbose });

  console.log('\nImport Complete');
  console.log('===============');
  console.log(`  Sessions imported: ${result.sessionsImported}`);
  console.log(`  Sessions skipped:  ${result.sessionsSkipped}`);
  console.log(`  Messages imported: ${result.messagesImported}`);

  if (result.errors.length > 0) {
    console.log(`\n  Errors: ${result.errors.length}`);
    for (const err of result.errors.slice(0, 5)) {
      console.log(`    - ${err}`);
    }
    if (result.errors.length > 5) {
      console.log(`    ... and ${result.errors.length - 5} more`);
    }
  }
}
