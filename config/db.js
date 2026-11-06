const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { dbPath } = require('./index');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL'); // readers never wait for the writer
db.pragma('synchronous = NORMAL'); // safe with WAL and avoids an fsync per write
db.pragma('cache_size = -16000'); // 16 MB page cache: fast reads, bounded RAM
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    code       TEXT PRIMARY KEY,
    url        TEXT NOT NULL,
    owner      TEXT NOT NULL,
    clicks     INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    expires_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS urls_owner_created ON urls (owner, created_at DESC);
  CREATE INDEX IF NOT EXISTS urls_owner_url ON urls (owner, url);

  CREATE TABLE IF NOT EXISTS daily_clicks (
    code   TEXT NOT NULL REFERENCES urls (code) ON DELETE CASCADE,
    day    TEXT NOT NULL,
    clicks INTEGER NOT NULL,
    PRIMARY KEY (code, day)
  ) WITHOUT ROWID;
`);

module.exports = db;
