// mem add command

import { addBreadcrumb, addDecision, addLearning } from '../lib/memory.js';
import { detectProject } from '../lib/project.js';

interface AddBreadcrumbOptions {
  project?: string;
  category?: string;
  importance?: number;
}

export function runAddBreadcrumb(content: string, options: AddBreadcrumbOptions): void {
  if (!content || !content.trim()) {
    console.error('Error: Content cannot be empty');
    process.exit(1);
  }

  const project = options.project || detectProject();

  const id = addBreadcrumb({
    content,
    project,
    category: options.category,
    importance: options.importance ?? 5
  });

  console.log(`✓ Added breadcrumb #${id}${project ? ` [${project}]` : ''}`);
}

interface AddDecisionOptions {
  project?: string;
  category?: string;
  why?: string;
  alternatives?: string;
}

export function runAddDecision(decision: string, options: AddDecisionOptions): void {
  if (!decision || !decision.trim()) {
    console.error('Error: Decision text cannot be empty');
    process.exit(1);
  }

  const project = options.project || detectProject();

  const id = addDecision({
    decision,
    project,
    category: options.category,
    reasoning: options.why,
    alternatives: options.alternatives,
    status: 'active'
  });

  console.log(`✓ Added decision #${id}${project ? ` [${project}]` : ''}`);
}

interface AddLearningOptions {
  project?: string;
  category?: string;
  prevention?: string;
  tags?: string;
}

export function runAddLearning(problem: string, solution: string, options: AddLearningOptions): void {
  if (!problem || !problem.trim()) {
    console.error('Error: Problem description cannot be empty');
    process.exit(1);
  }

  const project = options.project || detectProject();

  const id = addLearning({
    problem,
    solution,
    project,
    category: options.category,
    prevention: options.prevention,
    tags: options.tags
  });

  console.log(`✓ Added learning #${id}${project ? ` [${project}]` : ''}`);
}
