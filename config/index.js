require('dotenv').config({ quiet: true });
const path = require('path');

const port = Number(process.env.PORT) || 4116;
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, '');

let baseHost;
try {
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
  baseHost = parsed.host;
} catch {
  throw new Error(`Invalid BASE_URL: ${baseUrl}`);
}

const trustProxy = process.env.TRUST_PROXY || false;

module.exports = {
  port,
  baseUrl,
  baseHost,
  secureCookies: baseUrl.startsWith('https:'),
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'urls.db'),
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN) || 30,
  // A number means "trust N proxy hops"; any other value is passed to Express as-is.
  trustProxy: /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
};
