CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  return_to TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS magic_link_tokens_email_created_at_idx
  ON magic_link_tokens (email, created_at DESC);

CREATE TABLE IF NOT EXISTS account_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_sessions_user_id_last_seen_at_idx
  ON account_sessions (user_id, last_seen_at DESC);

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS content_type TEXT,
  ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS sha256 TEXT,
  ADD COLUMN IF NOT EXISTS upload_confirmed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS performance_sessions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phase TEXT NOT NULL,
  composition_id TEXT NOT NULL,
  composition_snapshot JSONB NOT NULL,
  transport_start_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS participant_snapshots (
  id TEXT PRIMARY KEY,
  performance_session_id TEXT NOT NULL REFERENCES performance_sessions(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (performance_session_id, participant_id)
);

CREATE TABLE IF NOT EXISTS performance_event_logs (
  id TEXT PRIMARY KEY,
  performance_session_id TEXT NOT NULL REFERENCES performance_sessions(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS health_reports (
  id TEXT PRIMARY KEY,
  performance_session_id TEXT NOT NULL REFERENCES performance_sessions(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL,
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS positioning_scan_exports (
  id TEXT PRIMARY KEY,
  performance_session_id TEXT REFERENCES performance_sessions(id) ON DELETE SET NULL,
  owner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  scan_id TEXT NOT NULL,
  profile JSONB NOT NULL,
  measurements JSONB NOT NULL,
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
