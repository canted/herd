CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE compositions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  composition_id TEXT NOT NULL,
  name TEXT NOT NULL,
  document JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, composition_id)
);

CREATE TABLE packages (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  composition_record_id TEXT NOT NULL REFERENCES compositions(id) ON DELETE CASCADE,
  composition_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  tigris_object_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendingUpload', 'ready')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (composition_record_id, version)
);
