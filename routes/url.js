const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const QRCode = require('qrcode');
const { baseUrl, baseHost, rateLimitPerMin, secureCookies } = require('../config');
const Url = require('../models/Url');

const router = express.Router();
const api = express.Router();

const MAX_URL_LENGTH = 2048;
const STATS_DAYS = 30;
const OWNER_COOKIE_RE = /(?:^|;\s*)sid=([A-Za-z0-9_-]{22})(?:;|$)/;

const fail = (res, status, error) => res.status(status).json({ error });

const toJSON = (row) => ({
  urlCode: row.code,
  shortUrl: `${baseUrl}/${row.code}`,
  originalUrl: row.url,
  clicks: row.clicks,
  createdAt: new Date(row.created_at).toISOString(),
  expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
});

function parseTarget(input) {
  if (typeof input !== 'string' || input.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(input.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

// Without accounts, each browser gets a random anonymous id in a cookie,
// and only sees and manages the links it created.
function identifyOwner(req, res, next) {
  const match = OWNER_COOKIE_RE.exec(req.headers.cookie || '');
  req.owner = match ? match[1] : crypto.randomBytes(16).toString('base64url');
  if (!match) {
    res.cookie('sid', req.owner, {
      httpOnly: true,
      sameSite: 'lax',
      secure: secureCookies,
      maxAge: 365 * Url.DAY_MS,
    });
  }
  next();
}

function findOwnedOr404(req, res) {
  const row = Url.findOwned(req.params.code, req.owner);
  if (!row) fail(res, 404, 'Không tìm thấy link');
  return row;
}

const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: rateLimitPerMin,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Bạn tạo link quá nhanh, vui lòng thử lại sau 1 phút' },
});

api.post('/shorten', createLimiter, (req, res, next) => {
  const { originalUrl, customCode, expiresInDays } = req.body;

  const target = parseTarget(originalUrl);
  if (!target) {
    return fail(res, 400, 'URL không hợp lệ. Chỉ chấp nhận link http:// hoặc https://');
  }
  if (target.host === baseHost) {
    return fail(res, 400, 'Không thể rút gọn link của chính trang này');
  }

  const code = typeof customCode === 'string' ? customCode.trim() : '';
  if (customCode != null && customCode !== '' && (!Url.CODE_RE.test(code) || Url.RESERVED_CODES.has(code.toLowerCase()))) {
    return fail(res, 400, 'Mã tùy chỉnh chỉ gồm chữ, số, - và _ (3–32 ký tự)');
  }

  let expiresAt = null;
  if (expiresInDays != null && expiresInDays !== '') {
    const days = Number(expiresInDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      return fail(res, 400, 'Số ngày hết hạn phải từ 1 đến 3650');
    }
    expiresAt = Date.now() + days * Url.DAY_MS;
  }

  Url.create({ url: target.href, owner: req.owner, code: code || null, expiresAt })
    .then((result) => {
      if (!result) return fail(res, 409, 'Mã này đã được sử dụng');
      res.status(result.created ? 201 : 200).json(toJSON(result.row));
    })
    .catch(next);
});

api.get('/urls', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  Url.flushClicks(); // show up-to-the-second click counts
  const rows = Url.listByOwner(req.owner, limit + 1, offset);
  res.json({ items: rows.slice(0, limit).map(toJSON), hasMore: rows.length > limit });
});

api.delete('/urls/:code', (req, res) => {
  if (!Url.remove(req.params.code, req.owner)) return fail(res, 404, 'Không tìm thấy link');
  res.status(204).end();
});

api.get('/urls/:code/stats', (req, res) => {
  Url.flushClicks();
  const row = findOwnedOr404(req, res);
  if (!row) return;
  res.json({ ...toJSON(row), daily: Url.dailyClicks(row.code, STATS_DAYS) });
});

api.get('/urls/:code/qr', (req, res, next) => {
  const row = findOwnedOr404(req, res);
  if (!row) return;
  QRCode.toString(`${baseUrl}/${row.code}`, { type: 'svg', margin: 1, width: 240 })
    .then((svg) => res.set('Cache-Control', 'private, max-age=86400').type('svg').send(svg))
    .catch(next);
});

router.use('/api', express.json({ limit: '4kb' }), identifyOwner, api);

// Hot path: one indexed lookup and an in-memory click counter.
router.get(`/:code(${Url.CODE_PATTERN})`, (req, res) => {
  const link = Url.findTarget(req.params.code);
  if (!link) return res.status(404).type('text').send('Link không tồn tại');
  if (link.expires_at && link.expires_at <= Date.now()) {
    return res.status(410).type('text').send('Link đã hết hạn');
  }
  Url.recordClick(req.params.code);
  res.status(302).location(link.url).end();
});

module.exports = router;
