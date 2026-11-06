[English](./README.md) | [Vietnamese](./README.vi-VN.md) |
# URL Shortener

Link shortener built with Node.js + Express, data stored in SQLite.
No separate database server needed.

## Features

- Shorten a long link, or set your own short code, for example `/khuyen-mai`.
- Set a link expiry: 1 day, 7 days, 30 days, 1 year.
- Count clicks and view daily clicks for the last 30 days.
- Create a QR code for each link, view and download it as SVG.
- Delete a link.
- Each browser only sees and manages its own links.
- Only accepts `http://` / `https://` links, limits links created per minute per IP.
- Interface in Vietnamese and English.

## Performance

Measured on a dev machine (Windows, Node 22, single process) with `npm run bench`:

| Scenario | Speed | Errors | Latency p50 / p99 |
|---|---|---|---|
| Redirect `GET /:code` | 3000 req/s for 30 seconds | 0 | 6 ms / 44 ms |
| Create link `POST /api/shorten` | ~3000 req/s for 10 seconds | 0 | 15 ms / 112 ms |

Peak RAM during the test: **~82 MB** (target under 200 MB).

Why it is fast and uses little RAM:

- SQLite runs in WAL mode inside the Node process. Reading one link takes about 2 µs, with no network connection like Redis / MongoDB.
- Data lives on disk, not in RAM, so RAM does not grow with the number of links. SQLite page cache is limited to 16 MB.
- Clicks are batched and written once per second, instead of writing to disk on every click.
- Link creation requests arriving at the same time are written in one transaction.
- `npm start` limits the Node heap to 128 MB.

## Setup

Requirement: Node.js 20 or later.

```bash
npm install
copy .env.example .env     # then change BASE_URL to your domain
npm start                  # production
npm run dev                # development, restarts automatically when code changes
```

Open in browser: `http://localhost:3000`

### Environment variables (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port the server runs on |
| `BASE_URL` | `http://localhost:PORT` | Public address, used to build short links |
| `DB_PATH` | `data/urls.db` | SQLite database file (created automatically) |
| `RATE_LIMIT_PER_MIN` | `30` | Max links one IP can create per minute |
| `TRUST_PROXY` | (empty) | Set to `1` if behind nginx / Cloudflare to get the real IP |

## Testing

```bash
npm test
```

Load test (start the server first, raise the creation limit to test link creation):

```bash
set RATE_LIMIT_PER_MIN=100000000 && npm start
npm run bench -- --rate 3000 --duration 30
```

## Project structure

```
shorturl/
├── config/
│   ├── index.js       # Read environment variables
│   └── db.js          # Open SQLite, tune performance, create tables
├── models/
│   └── Url.js         # Data queries, batch clicks and batch creation
├── routes/
│   └── url.js         # API and redirect routes
├── public/            # Frontend (index.html, styles.css, script.js)
├── scripts/bench.js   # Load test with autocannon
├── test/api.test.js   # API tests
└── server.js          # Start the server
```

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/shorten` | Body `{ "originalUrl": "...", "customCode"?: "...", "expiresInDays"?: 7 }`. Returns `201` on create, `200` if already shortened before, `409` if the custom code is taken. |
| `GET` | `/api/urls?limit=20&offset=0` | Your link list: `{ items, hasMore }` |
| `GET` | `/api/urls/:code/stats` | Link info and daily clicks for 30 days |
| `GET` | `/api/urls/:code/qr` | QR code (SVG) |
| `DELETE` | `/api/urls/:code` | Delete a link |
| `GET` | `/:code` | Redirect to the original link (`404` if not found, `410` if expired) |

Each link looks like: `{ urlCode, shortUrl, originalUrl, clicks, createdAt, expiresAt }`.

## Notes

- No account: the browser gets an anonymous cookie. If you clear cookies or use another browser, you will not see the history again (the links still work).
- When stopping the server with Ctrl+C, pending clicks are saved before exit. If the server is killed abruptly, up to 1 second of clicks may be lost.
- Backup: copy the files in the `data/` folder.

