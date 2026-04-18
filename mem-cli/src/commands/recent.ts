// mem recent command

import {
  recentMessages,
  recentDecisions,
  recentLearnings,
  recentBreadcrumbs
} from '../lib/memory.js';

interface RecentOptions {
  project?: string;
  limit?: number;
}

export function runRecent(table: string | undefined, options: RecentOptions): void {
  const limit = options.limit || 10;

  if (!table || table === 'all') {
    // Show recent from all tables
    showRecentAll(limit, options.project);
    return;
  }

  switch (table) {
    case 'messages':
      showRecentMessages(limit, options.project);
      break;
    case 'decisions':
      showRecentDecisions(limit, options.project);
      break;
    case 'learnings':
      showRecentLearnings(limit, options.project);
      break;
    case 'breadcrumbs':
      showRecentBreadcrumbs(limit, options.project);
      break;
    default:
      console.error(`Unknown table: ${table}`);
      console.error('Valid tables: messages, decisions, learnings, breadcrumbs, all');
      process.exit(1);
  }
}

function showRecentAll(limit: number, project?: string): void {
  const messages = recentMessages(3, project);
  const decisions = recentDecisions(3, project);
  const learnings = recentLearnings(2, project);
  const breadcrumbs = recentBreadcrumbs(2, project);

  if (messages.length > 0) {
    console.log('=== Recent Messages ===');
    for (const m of messages) {
      const preview = m.content.slice(0, 80).replace(/\n/g, ' ');
      console.log(`  [${m.role}] ${preview}...`);
    }
    console.log('');
  }

  if (decisions.length > 0) {
    console.log('=== Recent Decisions ===');
    for (const d of decisions) {
      console.log(`  #${d.id}: ${d.decision.slice(0, 60)}...`);
    }
    console.log('');
  }

  if (learnings.length > 0) {
    console.log('=== Recent Learnings ===');
    for (const l of learnings) {
      console.log(`  #${l.id}: ${l.problem.slice(0, 60)}...`);
    }
    console.log('');
  }

  if (breadcrumbs.length > 0) {
    console.log('=== Recent Breadcrumbs ===');
    for (const b of breadcrumbs) {
      console.log(`  #${b.id}: ${b.content.slice(0, 60)}...`);
    }
  }
}

function showRecentMessages(limit: number, project?: string): void {
  const messages = recentMessages(limit, project);

  if (messages.length === 0) {
    console.log('No messages found.');
    return;
  }

  console.log(`Recent ${messages.length} messages:\n`);

  for (const m of messages) {
    const date = m.timestamp.split('T')[0];
    const time = m.timestamp.split('T')[1]?.slice(0, 5) || '';
    const preview = m.content.length > 100 ? m.content.slice(0, 100) + '...' : m.content;

    console.log(`[${m.role}] ${date} ${time}`);
    console.log(`  ${preview.replace(/\n/g, ' ')}`);
    console.log('');
  }
}

function showRecentDecisions(limit: number, project?: string): void {
  const decisions = recentDecisions(limit, project);

  if (decisions.length === 0) {
    console.log('No decisions found.');
    return;
  }

  console.log(`Recent ${decisions.length} decisions:\n`);

  for (const d of decisions) {
    const date = d.created_at?.split('T')[0] || 'unknown';
    const projectTag = d.project ? ` [${d.project}]` : '';

    console.log(`#${d.id}${projectTag} ${date}`);
    console.log(`  Decision: ${d.decision}`);
    if (d.reasoning) {
      console.log(`  Why: ${d.reasoning}`);
    }
    console.log('');
  }
}

function showRecentLearnings(limit: number, project?: string): void {
  const learnings = recentLearnings(limit, project);

  if (learnings.length === 0) {
    console.log('No learnings found.');
    return;
  }

  console.log(`Recent ${learnings.length} learnings:\n`);

  for (const l of learnings) {
    const date = l.created_at?.split('T')[0] || 'unknown';
    const projectTag = l.project ? ` [${l.project}]` : '';

    console.log(`#${l.id}${projectTag} ${date}`);
    console.log(`  Problem: ${l.problem}`);
    if (l.solution) {
      console.log(`  Solution: ${l.solution}`);
    }
    console.log('');
  }
}

function showRecentBreadcrumbs(limit: number, project?: string): void {
  const breadcrumbs = recentBreadcrumbs(limit, project);

  if (breadcrumbs.length === 0) {
    console.log('No breadcrumbs found.');
    return;
  }

  console.log(`Recent ${breadcrumbs.length} breadcrumbs:\n`);

  for (const b of breadcrumbs) {
    const date = b.created_at?.split('T')[0] || 'unknown';
    const projectTag = b.project ? ` [${b.project}]` : '';
    const importance = b.importance !== 5 ? ` (importance: ${b.importance})` : '';

    console.log(`#${b.id}${projectTag}${importance} ${date}`);
    console.log(`  ${b.content}`);
    console.log('');
  }
}
