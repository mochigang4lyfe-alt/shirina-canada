-- Shirina Canada: permanent Sweeties authentication.
-- Independent of Cloudflare Access.
-- Never store plaintext login codes or session tokens.

CREATE TABLE sweeties_email_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
    CHECK(attempts BETWEEN 0 AND 10),
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX sweeties_email_codes_lookup
ON sweeties_email_codes(email, expires_at);

CREATE TABLE sweeties_sessions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX sweeties_sessions_member
ON sweeties_sessions(member_id, expires_at);

CREATE TABLE sweeties_auth_limits (
  limit_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
    CHECK(attempts >= 0)
);
