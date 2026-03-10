# JoltHost — Static Site Pastebin

A minimal pastebin for static sites: upload an HTML file or a ZIP and get a shareable URL. Built with **Nuxt 3** and deployable to **Cloudflare Pages + D1 + R2** (or locally via Docker).

## Requirements

- **Node.js** ≥ 18 (recommended ≥ 20 for Nuxt 3)

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

- **Upload** (`.html` or `.zip`) via drag-and-drop or file picker
- **Short slugs** (e.g. `quick-apple-42`) for URLs like `yoursite.com/view/quick-apple-42`
- **Static serving**: `/view/[slug]` serves the entry `index.html`; `/view/[slug]/**` serves assets (CSS, JS, images) with correct `Content-Type`

## API

- **POST `/api/upload`** — `multipart/form-data` with a `file` field (`.html` or `.zip`). Returns `{ slug, url, entry_point }`. Upload size is limited (default 100MB). Set **`NUXT_JOLTHOST_UPLOAD_MAX_BYTES`** (bytes) to change the limit.

## Cloudflare Pages / D1 / R2 Deployment

JoltHost uses [NuxtHub](https://hub.nuxt.com) to run on Cloudflare's edge infrastructure:
- **D1** — serverless SQLite database for metadata
- **R2** — object storage for uploaded HTML/ZIP files
- **Workers** — runs the entire server as a Cloudflare Worker
- **Cron Triggers** — fires the cleanup task every 15 minutes

### 1. Create Cloudflare resources

```bash
# Create D1 database
npx wrangler d1 create jolt-host
# → note the database_id output

# Create R2 bucket
npx wrangler r2 bucket create jolt-host-blob
```

### 2. Configure wrangler.toml

Replace the placeholder `database_id` in `wrangler.toml` with the ID from the previous step:

```toml
[[d1_databases]]
binding = "DB"
database_name = "jolt-host"
database_id = "<your-database-id>"  # ← replace this
```

### 3. Apply D1 migrations

```bash
# Apply to production
npx wrangler d1 execute jolt-host --remote --file=server/database/migrations/0001_init.sql

# Apply locally for development
npx wrangler d1 execute jolt-host --local --file=server/database/migrations/0001_init.sql
```

### 4. Build and deploy

```bash
# Build for Cloudflare Pages
npx nuxt build --preset=cloudflare-pages

# Deploy via Wrangler
npx wrangler pages deploy .output/public
```

### Environment variables

Set these in the Cloudflare Pages dashboard (Settings → Environment Variables):

| Variable | Description |
|---|---|
| `NUXT_JOLTHOST_ADMIN_PASSWORD` | Admin panel password |
| `JOLT_ADMIN_SECRET` | Secret for admin session cookies |
| `JOLT_WEB_SECRET` | Secret for web session cookies |
| `JOLT_VIEW_SECRET` | Secret for view unlock tokens |
| `NUXT_JOLTHOST_UPLOAD_MAX_BYTES` | Max upload size in bytes (default: 104857600 = 100 MB) |

### Local development with Wrangler

For a local dev environment that mirrors Cloudflare (D1 + R2):

```bash
npx nuxt dev
```

NuxtHub uses local filesystem drivers automatically in dev mode. To test with actual Wrangler local bindings, follow the [NuxtHub self-hosted docs](https://hub.nuxt.com/docs/getting-started/self-hosted).

## Docker / VPS deployment

If you prefer to self-host on a VPS without Cloudflare, the Docker setup continues to work as before. NuxtHub falls back to local filesystem drivers when not running on Cloudflare:

```bash
docker compose up -d --build
```

App is at [http://localhost:3000](http://localhost:3000). On a VPS, use a reverse proxy (e.g. Caddy or Nginx) in front.

## Data

- **Cloudflare D1**: Upload metadata (slugs, password hashes, expiration dates, API tokens)
- **Cloudflare R2**: Uploaded files stored as `{slug}/{filename}` objects
- **Docker**: SQLite at `./data/jolt.db`, files at `./storage/{slug}/`

## Scripts

- `npm run dev` — dev server
- `npm run build` — production build (Node.js server)
- `npm run build -- --preset=cloudflare-pages` — build for Cloudflare Pages
- `npm run preview` — preview production build
- `npm run test` — run all tests

