const crypto = require('crypto');
const db = require('../config/db');

const CODE_PATTERN = '[A-Za-z0-9_-]{3,32}';
const CODE_RE = new RegExp(`^${CODE_PATTERN}$`);
const RESERVED_CODES = new Set(['api']);
const DAY_MS = 24 * 60 * 60 * 1000;

const stmt = {
  insert: db.prepare(
    'INSERT OR IGNORE INTO urls (code, url, owner, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'
  ),
  target: db.prepare('SELECT url, expires_at FROM urls WHERE code = ?'),
  findOwned: db.prepare('SELECT * FROM urls WHERE code = ? AND owner = ?'),
  findSame: db.prepare(
    'SELECT * FROM urls WHERE owner = ? AND url = ? AND expires_at IS NULL LIMIT 1'
  ),
  list: db.prepare(
    'SELECT * FROM urls WHERE owner = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ),
  remove: db.prepare('DELETE FROM urls WHERE code = ? AND owner = ?'),
  addClicks: db.prepare('UPDATE urls SET clicks = clicks + ? WHERE code = ?'),
  // Inserts nothing when the link was deleted after it was clicked.
  addDaily: db.prepare(`
    INSERT INTO daily_clicks (code, day, clicks)
    SELECT code, ?, ? FROM urls WHERE code = ?
    ON CONFLICT (code, day) DO UPDATE SET clicks = clicks + excluded.clicks
  `),
  daily: db.prepare('SELECT day, clicks FROM daily_clicks WHERE code = ? AND day >= ?'),
};

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Returns { row, created }, or null when the requested custom code is taken.
// A plain link (no custom code, no expiry) the owner already shortened is returned as is.
function insertOne({ url, owner, code, expiresAt }) {
  if (!code && !expiresAt) {
    const existing = stmt.findSame.get(owner, url);
    if (existing) return { row: existing, created: false };
  }
  const createdAt = Date.now();
  const candidates = code ? [code] : Array.from({ length: 5 }, () => crypto.randomBytes(5).toString('base64url'));
  for (const candidate of candidates) {
    if (stmt.insert.run(candidate, url, owner, createdAt, expiresAt).changes > 0) {
      const row = { code: candidate, url, owner, clicks: 0, created_at: createdAt, expires_at: expiresAt };
      return { row, created: true };
    }
  }
  if (code) return null;
  throw new Error('Could not generate a unique short code');
}

// Creates are group-committed: requests arriving in the same event-loop turn share
// one transaction, because a commit costs far more than the insert itself.
const createQueue = [];
const insertBatch = db.transaction((inputs) => inputs.map(insertOne));

function flushCreates() {
  const jobs = createQueue.splice(0);
  try {
    const results = insertBatch(jobs.map((job) => job.input));
    jobs.forEach((job, i) => job.resolve(results[i]));
  } catch (err) {
    jobs.forEach((job) => job.reject(err));
  }
}

function create(input) {
  return new Promise((resolve, reject) => {
    if (createQueue.push({ input, resolve, reject }) === 1) setImmediate(flushCreates);
  });
}

// Clicks are counted in memory and written in one transaction per second,
// so a burst of redirects costs one disk write instead of one per click.
const pendingClicks = new Map();

const writeClicks = db.transaction((entries) => {
  const day = dayKey(Date.now());
  for (const [code, count] of entries) {
    stmt.addClicks.run(count, code);
    stmt.addDaily.run(day, count, code);
  }
});

function flushClicks() {
  if (pendingClicks.size === 0) return;
  const entries = [...pendingClicks];
  pendingClicks.clear();
  writeClicks(entries);
}

setInterval(() => {
  try {
    flushClicks();
  } catch (err) {
    console.error('Failed to save clicks:', err);
  }
}, 1000).unref();

function recordClick(code) {
  pendingClicks.set(code, (pendingClicks.get(code) || 0) + 1);
}

// One entry per day for the last `days` days, oldest first, including days without clicks.
function dailyClicks(code, days) {
  const now = Date.now();
  const counts = new Map(
    stmt.daily.all(code, dayKey(now - (days - 1) * DAY_MS)).map((r) => [r.day, r.clicks])
  );
  return Array.from({ length: days }, (_, i) => {
    const day = dayKey(now - (days - 1 - i) * DAY_MS);
    return { day, clicks: counts.get(day) || 0 };
  });
}

module.exports = {
  CODE_PATTERN,
  CODE_RE,
  RESERVED_CODES,
  DAY_MS,
  create,
  findTarget: (code) => stmt.target.get(code),
  findOwned: (code, owner) => stmt.findOwned.get(code, owner),
  listByOwner: (owner, limit, offset) => stmt.list.all(owner, limit, offset),
  remove: (code, owner) => stmt.remove.run(code, owner).changes > 0,
  recordClick,
  flushClicks,
  dailyClicks,
};
