-- Administrator-managed announcement channel.
-- No administrator is automatically granted posting permissions.
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id TEXT NOT NULL REFERENCES admins(id),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 5000),
  published INTEGER NOT NULL DEFAULT 1 CHECK(published IN (0,1)),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS announcements_public
ON announcements(published,pinned,created_at);
