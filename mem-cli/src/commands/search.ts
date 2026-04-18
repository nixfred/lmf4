// mem search command

import { search } from '../lib/memory.js';

interface SearchOptions {
  project?: string;
  table?: string;
  limit?: number;
}

export function runSearch(query: string, options: SearchOptions): void {
  const results = search(query, {
    project: options.project,
    table: options.table,
    limit: options.limit || 20
  });

  if (results.length === 0) {
    console.log('No results found.');
    return;
  }

  console.log(`Found ${results.length} result(s):\n`);

  for (const result of results) {
    const preview = result.content.length > 100
      ? result.content.slice(0, 100) + '...'
      : result.content;

    const projectTag = result.project ? ` [${result.project}]` : '';
    const date = result.created_at.split('T')[0];

    console.log(`[${result.table}#${result.id}]${projectTag} ${date}`);
    console.log(`  ${preview.replace(/\n/g, ' ')}`);
    console.log('');
  }
}
