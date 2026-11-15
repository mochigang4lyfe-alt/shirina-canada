-- Shirina Canada / Mochigang forum
-- Initial database schema. No users or posts inserted.

CREATE TABLE provinces (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  province_code TEXT NOT NULL REFERENCES provinces(code),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(province_code, slug)
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  suspended_at TEXT
);

CREATE TABLE threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL REFERENCES members(id),
  province_code TEXT REFERENCES provinces(code),
  city_id INTEGER REFERENCES cities(id),
  category TEXT NOT NULL CHECK(category IN ('covers','requests','lounge','local')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
  hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1))
);

CREATE INDEX threads_by_city ON threads(city_id, created_at);
CREATE INDEX threads_by_category ON threads(category, created_at);

CREATE TABLE replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES threads(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK(hidden IN (0,1))
);

CREATE INDEX replies_by_thread ON replies(thread_id, created_at);

CREATE TABLE admins (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('owner','moderator')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Admin authentication will be handled through Cloudflare Access.
-- This table records application-level authorization.

CREATE TABLE cover_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT REFERENCES members(id),
  video_url TEXT NOT NULL,
  song_title TEXT NOT NULL,
  original_artist TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES admins(id),
  reviewed_at TEXT,
  rejection_reason TEXT CHECK(
    rejection_reason IN ('malicious_link','not_canadian_cover','mochigang_quality')
  ),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX submissions_by_status
ON cover_submissions(status, created_at);

CREATE TABLE moderation_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL REFERENCES admins(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
