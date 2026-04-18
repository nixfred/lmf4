// Database schema for LMF

export const SCHEMA_VERSION = 2; // Bumped for vector search

export const CREATE_TABLES = `
-- Sessions table: tracks Claude Code sessions
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  summary TEXT,
  project TEXT,
  cwd TEXT,
  git_branch TEXT,
  model TEXT
);

-- Messages table: conversation turns (user/assistant)
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp DATETIME NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  project TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

-- Decisions table: architectural and process decisions
CREATE TABLE IF NOT EXISTS decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  session_id TEXT,
  category TEXT,
  project TEXT,
  decision TEXT NOT NULL,
  reasoning TEXT,
  alternatives TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'reverted')),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

-- Learnings table: problems solved and patterns discovered
CREATE TABLE IF NOT EXISTS learnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  session_id TEXT,
  category TEXT,
  project TEXT,
  problem TEXT NOT NULL,
  solution TEXT,
  prevention TEXT,
  tags TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

-- Breadcrumbs table: context, notes, references
CREATE TABLE IF NOT EXISTS breadcrumbs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  session_id TEXT,
  content TEXT NOT NULL,
  category TEXT,
  project TEXT,
  importance INTEGER DEFAULT 5 CHECK (importance BETWEEN 1 AND 10),
  expires_at DATETIME,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Library of Alexandria entries (curated knowledge with lineage)
CREATE TABLE IF NOT EXISTS loa_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  title TEXT NOT NULL,
  description TEXT,
  fabric_extract TEXT NOT NULL,
  message_range_start INTEGER,
  message_range_end INTEGER,
  parent_loa_id INTEGER,
  session_id TEXT,
  project TEXT,
  tags TEXT,
  message_count INTEGER,
  FOREIGN KEY (parent_loa_id) REFERENCES loa_entries(id),
  FOREIGN KEY (message_range_start) REFERENCES messages(id),
  FOREIGN KEY (message_range_end) REFERENCES messages(id)
);

-- TELOS entries: Purpose framework sections (Problems, Missions, Goals, Challenges, Strategies)
CREATE TABLE IF NOT EXISTS telos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('identity', 'problem', 'mission', 'goal', 'challenge', 'strategy', 'project', 'skill', 'aspiration', 'metric', 'other')),
  category TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  parent_code TEXT,
  source_file TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Documents table: standalone knowledge files (diary, reference, wisdom extracts)
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('diary', 'reference', 'wisdom', 'plan', 'memory', 'enterprise', 'other')),
  content TEXT NOT NULL,
  summary TEXT,
  size_bytes INTEGER,
  file_modified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

export const CREATE_INDEXES = `
-- Session indexes
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);

-- Message indexes
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project);

-- Decision indexes
CREATE INDEX IF NOT EXISTS idx_decisions_project ON decisions(project);
CREATE INDEX IF NOT EXISTS idx_decisions_category ON decisions(category);
CREATE INDEX IF NOT EXISTS idx_decisions_created ON decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_status ON decisions(status);

-- Learning indexes
CREATE INDEX IF NOT EXISTS idx_learnings_project ON learnings(project);
CREATE INDEX IF NOT EXISTS idx_learnings_category ON learnings(category);
CREATE INDEX IF NOT EXISTS idx_learnings_created ON learnings(created_at);

-- Breadcrumb indexes
CREATE INDEX IF NOT EXISTS idx_breadcrumbs_project ON breadcrumbs(project);
CREATE INDEX IF NOT EXISTS idx_breadcrumbs_importance ON breadcrumbs(importance);
CREATE INDEX IF NOT EXISTS idx_breadcrumbs_created ON breadcrumbs(created_at);

-- LoA indexes
CREATE INDEX IF NOT EXISTS idx_loa_project ON loa_entries(project);
CREATE INDEX IF NOT EXISTS idx_loa_created ON loa_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_loa_parent ON loa_entries(parent_loa_id);

-- TELOS indexes
CREATE INDEX IF NOT EXISTS idx_telos_type ON telos(type);
CREATE INDEX IF NOT EXISTS idx_telos_category ON telos(category);
CREATE INDEX IF NOT EXISTS idx_telos_parent ON telos(parent_code);

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_created ON documents(created_at);
`;

export const CREATE_FTS = `
-- FTS5 virtual table for messages (conversation search)
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  project,
  content='messages',
  content_rowid='id'
);

-- FTS5 virtual table for decisions
CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(
  decision,
  reasoning,
  project,
  content='decisions',
  content_rowid='id'
);

-- FTS5 virtual table for learnings
CREATE VIRTUAL TABLE IF NOT EXISTS learnings_fts USING fts5(
  problem,
  solution,
  tags,
  project,
  content='learnings',
  content_rowid='id'
);

-- FTS5 virtual table for breadcrumbs
CREATE VIRTUAL TABLE IF NOT EXISTS breadcrumbs_fts USING fts5(
  content,
  category,
  project,
  content='breadcrumbs',
  content_rowid='id'
);

-- FTS5 virtual table for LoA entries
CREATE VIRTUAL TABLE IF NOT EXISTS loa_fts USING fts5(
  title,
  description,
  fabric_extract,
  tags,
  project,
  content='loa_entries',
  content_rowid='id'
);

-- FTS5 virtual table for TELOS
CREATE VIRTUAL TABLE IF NOT EXISTS telos_fts USING fts5(
  code,
  type,
  title,
  content,
  category,
  content='telos',
  content_rowid='id'
);

-- FTS5 virtual table for documents
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  title,
  type,
  content,
  summary,
  path,
  content='documents',
  content_rowid='id'
);
`;

export const CREATE_FTS_TRIGGERS = `
-- Messages FTS triggers
CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content, project) VALUES (new.id, new.content, new.project);
END;
CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, project) VALUES('delete', old.id, old.content, old.project);
END;
CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content, project) VALUES('delete', old.id, old.content, old.project);
  INSERT INTO messages_fts(rowid, content, project) VALUES (new.id, new.content, new.project);
END;

-- Decisions FTS triggers
CREATE TRIGGER IF NOT EXISTS decisions_ai AFTER INSERT ON decisions BEGIN
  INSERT INTO decisions_fts(rowid, decision, reasoning, project) VALUES (new.id, new.decision, new.reasoning, new.project);
END;
CREATE TRIGGER IF NOT EXISTS decisions_ad AFTER DELETE ON decisions BEGIN
  INSERT INTO decisions_fts(decisions_fts, rowid, decision, reasoning, project) VALUES('delete', old.id, old.decision, old.reasoning, old.project);
END;
CREATE TRIGGER IF NOT EXISTS decisions_au AFTER UPDATE ON decisions BEGIN
  INSERT INTO decisions_fts(decisions_fts, rowid, decision, reasoning, project) VALUES('delete', old.id, old.decision, old.reasoning, old.project);
  INSERT INTO decisions_fts(rowid, decision, reasoning, project) VALUES (new.id, new.decision, new.reasoning, new.project);
END;

-- Learnings FTS triggers
CREATE TRIGGER IF NOT EXISTS learnings_ai AFTER INSERT ON learnings BEGIN
  INSERT INTO learnings_fts(rowid, problem, solution, tags, project) VALUES (new.id, new.problem, new.solution, new.tags, new.project);
END;
CREATE TRIGGER IF NOT EXISTS learnings_ad AFTER DELETE ON learnings BEGIN
  INSERT INTO learnings_fts(learnings_fts, rowid, problem, solution, tags, project) VALUES('delete', old.id, old.problem, old.solution, old.tags, old.project);
END;
CREATE TRIGGER IF NOT EXISTS learnings_au AFTER UPDATE ON learnings BEGIN
  INSERT INTO learnings_fts(learnings_fts, rowid, problem, solution, tags, project) VALUES('delete', old.id, old.problem, old.solution, old.tags, old.project);
  INSERT INTO learnings_fts(rowid, problem, solution, tags, project) VALUES (new.id, new.problem, new.solution, new.tags, new.project);
END;

-- Breadcrumbs FTS triggers
CREATE TRIGGER IF NOT EXISTS breadcrumbs_ai AFTER INSERT ON breadcrumbs BEGIN
  INSERT INTO breadcrumbs_fts(rowid, content, category, project) VALUES (new.id, new.content, new.category, new.project);
END;
CREATE TRIGGER IF NOT EXISTS breadcrumbs_ad AFTER DELETE ON breadcrumbs BEGIN
  INSERT INTO breadcrumbs_fts(breadcrumbs_fts, rowid, content, category, project) VALUES('delete', old.id, old.content, old.category, old.project);
END;
CREATE TRIGGER IF NOT EXISTS breadcrumbs_au AFTER UPDATE ON breadcrumbs BEGIN
  INSERT INTO breadcrumbs_fts(breadcrumbs_fts, rowid, content, category, project) VALUES('delete', old.id, old.content, old.category, old.project);
  INSERT INTO breadcrumbs_fts(rowid, content, category, project) VALUES (new.id, new.content, new.category, new.project);
END;

-- LoA FTS triggers
CREATE TRIGGER IF NOT EXISTS loa_ai AFTER INSERT ON loa_entries BEGIN
  INSERT INTO loa_fts(rowid, title, description, fabric_extract, tags, project) VALUES (new.id, new.title, new.description, new.fabric_extract, new.tags, new.project);
END;
CREATE TRIGGER IF NOT EXISTS loa_ad AFTER DELETE ON loa_entries BEGIN
  INSERT INTO loa_fts(loa_fts, rowid, title, description, fabric_extract, tags, project) VALUES('delete', old.id, old.title, old.description, old.fabric_extract, old.tags, old.project);
END;
CREATE TRIGGER IF NOT EXISTS loa_au AFTER UPDATE ON loa_entries BEGIN
  INSERT INTO loa_fts(loa_fts, rowid, title, description, fabric_extract, tags, project) VALUES('delete', old.id, old.title, old.description, old.fabric_extract, old.tags, old.project);
  INSERT INTO loa_fts(rowid, title, description, fabric_extract, tags, project) VALUES (new.id, new.title, new.description, new.fabric_extract, new.tags, new.project);
END;

-- TELOS FTS triggers
CREATE TRIGGER IF NOT EXISTS telos_ai AFTER INSERT ON telos BEGIN
  INSERT INTO telos_fts(rowid, code, type, title, content, category) VALUES (new.id, new.code, new.type, new.title, new.content, new.category);
END;
CREATE TRIGGER IF NOT EXISTS telos_ad AFTER DELETE ON telos BEGIN
  INSERT INTO telos_fts(telos_fts, rowid, code, type, title, content, category) VALUES('delete', old.id, old.code, old.type, old.title, old.content, old.category);
END;
CREATE TRIGGER IF NOT EXISTS telos_au AFTER UPDATE ON telos BEGIN
  INSERT INTO telos_fts(telos_fts, rowid, code, type, title, content, category) VALUES('delete', old.id, old.code, old.type, old.title, old.content, old.category);
  INSERT INTO telos_fts(rowid, code, type, title, content, category) VALUES (new.id, new.code, new.type, new.title, new.content, new.category);
END;

-- Documents FTS triggers
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, title, type, content, summary, path) VALUES (new.id, new.title, new.type, new.content, new.summary, new.path);
END;
CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, type, content, summary, path) VALUES('delete', old.id, old.title, old.type, old.content, old.summary, old.path);
END;
CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, type, content, summary, path) VALUES('delete', old.id, old.title, old.type, old.content, old.summary, old.path);
  INSERT INTO documents_fts(rowid, title, type, content, summary, path) VALUES (new.id, new.title, new.type, new.content, new.summary, new.path);
END;
`;

// Vector embeddings tables (requires sqlite-vec extension)
export const CREATE_VECTOR_TABLES = `
-- Embedding metadata: tracks what's embedded and with which model
CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_table TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  model TEXT NOT NULL DEFAULT 'nomic-embed-text',
  dimensions INTEGER NOT NULL DEFAULT 768,
  embedding BLOB NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_table, source_id)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(model);
`;

// Note: sqlite-vec virtual tables are created dynamically after loading the extension
// They use: CREATE VIRTUAL TABLE vec_xxx USING vec0(embedding float[768]);
