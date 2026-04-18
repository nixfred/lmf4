// Core types for LMF

export interface Session {
  id?: number;
  session_id: string;
  started_at: string;
  ended_at?: string;
  summary?: string;
  project?: string;
  cwd?: string;
  git_branch?: string;
  model?: string;
}

export interface Message {
  id?: number;
  session_id: string;
  timestamp: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  project?: string;
}

export interface Decision {
  id?: number;
  created_at?: string;
  session_id?: string;
  category?: string;
  project?: string;
  decision: string;
  reasoning?: string;
  alternatives?: string;
  status: 'active' | 'superseded' | 'reverted';
}

export interface Learning {
  id?: number;
  created_at?: string;
  session_id?: string;
  category?: string;
  project?: string;
  problem: string;
  solution?: string;
  prevention?: string;
  tags?: string;
}

export interface Breadcrumb {
  id?: number;
  created_at?: string;
  session_id?: string;
  content: string;
  category?: string;
  project?: string;
  importance: number;
  expires_at?: string;
}

export interface LoaEntry {
  id?: number;
  created_at?: string;
  title: string;
  description?: string;
  fabric_extract: string;
  message_range_start?: number;
  message_range_end?: number;
  parent_loa_id?: number;
  session_id?: string;
  project?: string;
  tags?: string;
  message_count?: number;
}

export interface SearchResult {
  table: string;
  id: number;
  content: string;
  project?: string;
  created_at: string;
  rank?: number;
}

export interface Stats {
  sessions: number;
  messages: number;
  decisions: number;
  learnings: number;
  breadcrumbs: number;
  loa_entries: number;
  telos: number;
  documents: number;
  db_size_bytes: number;
}

// JSONL import types (Claude Code session format)
export interface ClaudeSessionLine {
  type: 'user' | 'assistant' | 'file-history-snapshot' | string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string }>;
  };
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  uuid?: string;
}
