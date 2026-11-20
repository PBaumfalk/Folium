/**
 * Datenbankmigrationen. Jede Migration läuft genau einmal, in einer Transaktion.
 * Bestehende Migrationen werden NIE geändert – nur neue angehängt.
 */
export const migrations: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'grundschema',
    sql: `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('admin','editor','viewer')),
  password_hash TEXT,
  oidc_issuer TEXT,
  oidc_sub TEXT,
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);
CREATE UNIQUE INDEX users_email ON users(email);
CREATE UNIQUE INDEX users_oidc ON users(oidc_issuer, oidc_sub) WHERE oidc_sub IS NOT NULL;

CREATE TABLE sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  user_id INTEGER,
  user_label TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_at ON audit_log(at);
`,
  },
  {
    version: 2,
    name: 'seiten',
    sql: `
CREATE TABLE domains (
  id INTEGER PRIMARY KEY,
  host TEXT NOT NULL UNIQUE COLLATE NOCASE,
  page_id INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE pages (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  draft_content TEXT NOT NULL,
  draft_theme TEXT NOT NULL,
  draft_rev INTEGER NOT NULL DEFAULT 1,
  draft_updated_at INTEGER NOT NULL,
  draft_updated_by TEXT NOT NULL DEFAULT '',
  published_version_id INTEGER,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  deleted_at INTEGER
);

CREATE TABLE page_versions (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  content TEXT NOT NULL,
  theme TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT '',
  UNIQUE(page_id, number)
);

CREATE TABLE theme_history (
  id INTEGER PRIMARY KEY,
  page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT ''
);
CREATE INDEX theme_history_page ON theme_history(page_id, id);
`,
  },
  {
    version: 3,
    name: 'dateien',
    sql: `
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('image','svg','font')),
  ext TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  widths TEXT NOT NULL DEFAULT '[]',
  bytes INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT ''
);
`,
  },
  {
    version: 4,
    name: 'statistik',
    sql: `
CREATE TABLE stats_daily (
  page_id INTEGER NOT NULL,
  block_id TEXT NOT NULL DEFAULT '',
  day INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'direkt',
  kind TEXT NOT NULL CHECK (kind IN ('view','click')),
  bot INTEGER NOT NULL DEFAULT 0,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page_id, block_id, day, source, kind, bot)
) WITHOUT ROWID;
CREATE INDEX stats_day ON stats_daily(day);
`,
  },
  {
    version: 5,
    name: 'ki',
    sql: `
CREATE TABLE ai_runs (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  user_id INTEGER,
  url TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_eur REAL NOT NULL DEFAULT 0,
  ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  simulated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ai_runs_at ON ai_runs(at);
`,
  },
];
