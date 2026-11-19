-- Shirina Canada: permanent Sweeties registration.
-- Existing members must complete registration.
-- Registration does not depend on Cloudflare Access.

ALTER TABLE members ADD COLUMN sweeties_username TEXT;

ALTER TABLE members ADD COLUMN age_confirmed_at TEXT;

ALTER TABLE members ADD COLUMN registration_completed_at TEXT;

CREATE UNIQUE INDEX sweeties_username_unique
ON members(sweeties_username COLLATE NOCASE)
WHERE sweeties_username IS NOT NULL;

-- A previous Cloudflare login is not proof of registration.
-- Existing members receive NULL in all new columns.
-- The application must enforce registration before participation.
