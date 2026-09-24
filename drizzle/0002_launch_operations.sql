-- Additive and safe to reapply. Does not alter existing customer or authentication rows.
CREATE TABLE IF NOT EXISTS request_keys (
  owner TEXT NOT NULL,
  key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  body_hash TEXT NOT NULL,
  created TEXT NOT NULL,
  PRIMARY KEY (owner, key)
);
CREATE TABLE IF NOT EXISTS request_limits (
  scope TEXT PRIMARY KEY NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS request_limits_expiry ON request_limits(expires);
CREATE TABLE IF NOT EXISTS request_versions (
  request_id TEXT PRIMARY KEY NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 0,
  last_operation TEXT
);
CREATE TABLE IF NOT EXISTS request_updates (
  id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS request_updates_request_created ON request_updates(request_id, created);
