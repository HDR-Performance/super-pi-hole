CREATE TABLE review_settings (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL) STRICT;
CREATE TABLE review_snapshots (revision INTEGER PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
CREATE TABLE review_events (id INTEGER PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE INDEX idx_review_events_created_at ON review_events(created_at);
PRAGMA user_version = 1;
