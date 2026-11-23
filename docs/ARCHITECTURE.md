# Arc Light architecture

Notes for anyone working on the code. For what the app does and how to run it,
see the [README](../README.md).

## Overview

```mermaid
flowchart TB
    browser["Browser<br/>desktop · phone · TV"]
    tv["Chromecast / AirPlay"]

    subgraph app["app container"]
        web["React web app<br/>(built static files)"]
        subgraph api["Fastify API server · Node 22"]
            auth["auth<br/>sessions · passkeys · profiles · vault"]
            scanner["scanner<br/>walk → hash → classify → import"]
            media["media<br/>posters · previews · sprites · streaming"]
            metadata["metadata<br/>ffprobe · EXIF"]
            library["library<br/>visibility · categories · following"]
            backup["backup<br/>dump · verify · restore"]
        end
        ffmpeg["ffmpeg · ffprobe · sharp"]
        cache[("generated cache<br/>posters · previews")]
    end

    db[("db container<br/>PostgreSQL 17")]
    files[("Your video folders<br/>read-only")]
    ext["StashDB · ThePornDB<br/>(optional)"]

    browser -->|HTTP :3000| web
    browser -->|REST /api| auth
    tv -->|signed 6-hour link| media
    auth --> library
    scanner --> files
    scanner --> metadata
    media --> files
    media --> ffmpeg
    media --> cache
    metadata --> ext
    api -->|SQL via Drizzle| db
    backup --> db
```

### Repository layout

```
apps/
  server/          Fastify API, scanner, media pipeline (TypeScript)
    src/api/         One file per feature's HTTP routes
    src/auth/        Sessions, password hashing, passkeys, profile and vault unlock
    src/scanner/     Folder walk, content hashing, filename parsing, scan schedule
    src/media/       Poster, preview, sprite and thumbnail generation; MP4 streaming
    src/metadata/    ffprobe, photo EXIF, StashDB and ThePornDB clients
    src/library/     Visibility rules, categories, following, affinity
    src/collections/ Rule compiler for smart collections
    src/backup/      Backup creation, verification, restore, schedule
    src/db/          Drizzle schema, migrations, seed data
  web/             React single-page app
    src/pages/       One file per route
    src/components/  Shared UI (player, grids, editors, settings sections)
    src/lib/         API clients and shared hooks
docker/            Compose files for production and development
scripts/           Icon generation, restore helper
```

### How the pieces fit

- **Two containers.** `make up` starts the **app** container (the API server,
  which also serves the built web app, plus ffmpeg) and a **PostgreSQL 17**
  container. Your library is mounted into the app read-only.
- **What happens on boot.** The server applies database migrations, seeds the
  defaults, clears expired sessions, marks any scan that was interrupted as
  failed, then starts the scan and backup schedules. After that it serves
  traffic.
- **Scanning.** The scanner walks your folders and hashes each file so it can
  recognise moved files. It reads details from the path and filename, probes
  each video with ffprobe, and queues new items in the Inbox. Posters, hover
  previews and seek-bar sprites are generated with ffmpeg and kept in a cache
  that can be rebuilt at any time.
- **Playback.** MP4 files are streamed straight from disk with HTTP range
  requests. Nothing is ever transcoded, so playback costs almost no CPU.
- **Sign-in and security.** Sign-in uses server-side sessions in an HTTP-only
  cookie. Touch ID and passkeys use WebAuthn. Profile, vault and privacy
  unlocks are checked on the server, so hidden items are filtered out before
  they reach the browser. A LAN guard refuses non-local requests unless local
  network access is turned on. Casting gives the TV a signed link that works
  for six hours and only for that one video.
- **API.** A REST API with OpenAPI documentation, served at `/api/docs`.

### Data model

The core tables and how they relate. Per-profile tables keep each person's
history and preferences separate from the shared library.

```mermaid
erDiagram
    users ||--o{ profiles : owns
    libraries ||--o{ media_items : contains
    media_items ||--o{ media_files : "stored as"
    media_items }o--o{ performers : features
    media_items }o--|| studios : "released by"
    media_items }o--o{ tags : tagged
    media_items }o--o{ collections : "grouped in"
    profiles ||--o{ profile_item_state : "ratings · favourites · history"
    profile_item_state }o--|| media_items : about
```

### Tech stack

| Layer | Technology |
|---|---|
| Server | Node 22, TypeScript, Fastify 5, Drizzle ORM, PostgreSQL 17 |
| Web | React 19, Vite, TanStack Router, Query and Virtual, Tailwind CSS 4 |
| Media | ffmpeg / ffprobe, sharp, exifr |
| Auth | Server-side sessions, SimpleWebAuthn (passkeys and Touch ID) |
| Testing | Vitest, Testing Library |
| Packaging | Docker Compose, wrapped by a Makefile |


## Development

`make dev` runs the server and Vite in containers with the source code
mounted, and reloads when you edit. The web app is at
<http://localhost:5173>.

- **API documentation:** `/api/docs`
- **Migrations:** create one with `npm run db:generate -w apps/server`. They
  apply automatically when the server starts.
- **Web tests:** `npm test -w apps/web`
- **Adding a dependency:** `node_modules` lives in a container volume. Run
  `npm install` on your machine and again inside the container, then restart
  `app` and `web`.
- **Server tests** need a throwaway PostgreSQL database and a scratch
  `APP_DATA_DIR`. **Never run them inside the real `app` container**, because
  they delete uploaded images.

```bash
docker run -d --rm --name media-test-pg -p 55432:5432 \
  -e POSTGRES_USER=media -e POSTGRES_PASSWORD=media -e POSTGRES_DB=media postgres:17-alpine
APP_DATA_DIR=$(mktemp -d) \
TEST_ADMIN_URL=postgres://media:media@localhost:55432/media \
TEST_DATABASE_URL=postgres://media:media@localhost:55432/media_test \
  npm test -w apps/server
docker stop media-test-pg
```
