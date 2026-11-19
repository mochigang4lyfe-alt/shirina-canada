-- Shirina Canada: authenticated forum member identities.
-- Email is used internally, never displayed in public comments.

ALTER TABLE members ADD COLUMN access_email TEXT;

CREATE UNIQUE INDEX members_access_email_unique
ON members(access_email COLLATE NOCASE)
WHERE access_email IS NOT NULL;

CREATE INDEX members_active_lookup
ON members(id, suspended_at);
