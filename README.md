# Arc Light

**Arc Light is a self-hosted, private organiser and player for an adult video
collection.** You run it on your own computer with Docker, point it at the
folders where your videos live, and it builds a browsable library on top of
them: performers, studios, categories, collections and a full-screen player.
You open it in a browser on the same machine, or on your phone or TV over home
wifi.

It is built for one person's collection. Profiles let the people who share it
keep separate history and favourites.

**Your files stay where they are.** Arc Light opens your library read-only,
never moves or renames anything, and never uploads anything. The only outside
lookups are optional (StashDB and ThePornDB, with your own API keys), and they
run only when you ask for them.

---

## What it does

### Organising

- **Folder scanning.** Scans the folders you choose, either on demand or on a
  schedule. New videos land in an **Inbox** until you approve them.
- **Details from filenames.** Works out performers, studios, release dates and
  titles from folder and file names (see [Naming](#naming)). Anything you edit
  in the app always wins over the scanner.
- **Move-proof.** Recognises moved or renamed files by content hash, so you
  don't lose ratings, tags or history.
- **Personal data.** Tags (with parent tags), favourites, 1–5 star ratings, an
  O-counter, watch later, private notes, bookmarks, pins and saved searches.
- **Collections.** Manual collections, plus smart collections that fill
  themselves from rules you set.
- **Categories.** Home-page tiles such as Glamour, Hardcore or Cinematic,
  assigned by studio or studio network. A video you file by hand stays where
  you put it.
- **Bulk editing.** Edit many videos at once. Also includes albums with a
  slideshow, series, studio networks, and a graph of which performers work
  together.
- **Library health.** Reports missing files, storage use (as a treemap) and
  failed artwork, and has cleanup tools.
- **Optional lookups.** StashDB fills in cast, studio, tags and descriptions.
  ThePornDB adds named positions (for example "Missionary 15:21") as markers on
  the seek bar.

### Watching

- **Full-page player.** Shows the video's details, stills from its folder,
  your queue and *Up next*. While it plays, *In this scene* lists the cast.
- **Previews and seeking.** Hover previews, a thumbnail strip on the seek bar,
  a replay heatmap, bookmarks, and a contact sheet of frames (`G`).
- **Positions.** ThePornDB positions appear on the seek bar. Press `[` and `]`
  to jump between them.
- **Subtitles.** Reads `.srt` and `.vtt` files placed beside the video.
- **Lean-back mode.** Shuffle a studio, album or search into a hands-free queue.
- **Other screens.** Cast to Chromecast or AirPlay. The web app is laid out
  for phones, so there's no separate mobile app to install.

### Pages

| Page | What's on it |
|---|---|
| **Home** | Full-bleed scenes: a featured video, your categories as posters, *Keep watching*, a mood picker, new videos from who you follow, and *Just added* |
| **Browse** | The whole library, with filters, sorting and an alphabet index |
| **Performers** | A page for each performer: banner, fact sheet, *Roulette* (plays a random scene), *Often with*, and their videos by studio, all, or on a timeline. Ages are never shown |
| **Studios, Tags, Series, Albums** | Each one as its own browsable page |
| **Feed** | A post for every new video from the performers and studios you follow, plus suggestions of who else to follow |
| **Inbox** | Newly scanned videos waiting for approval, with a suggested filename |
| **Vault** | Each profile's hidden videos, unlocked with a PIN or passkey |
| **Stats, Diary, Tiers** | A year in review, an activity diary and a tier list |
| **Settings** | Library folders, scanning, appearance, profiles, privacy, network, backups and storage |

### Privacy

- **Profiles.** Each profile has its own PIN, history, favourites, stats and
  settings. Only the owner can manage the library.
- **A vault per profile.** Hidden videos stay out of every page, search and
  stat until you unlock them with the profile's PIN or a passkey.
- **Lock on open.** The app can ask for a password, Touch ID or a passkey
  every time it opens.
- **Discreet mode** (`Ctrl/Cmd + Shift + H`). Blurs every image instantly, and
  needs your privacy password or Touch ID to turn off. It stops someone
  glancing over your shoulder. It doesn't stop someone who has access to your
  computer.
- **Local network access is off by default.** Turn it on in Settings when you
  want to use a phone or TV.

---

## Architecture

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
    users ||--o{ sessions : "signs in with"
    users ||--o{ webauthn_credentials : "has passkeys"
    libraries ||--o{ library_roots : "scans folders"
    libraries ||--o{ media_items : contains
    media_items ||--o{ media_files : "stored as"
    media_items }o--o{ performers : "media_item_performers"
    media_items }o--o{ tags : "media_item_tags"
    tags ||--o{ tag_parents : "nested under"
    media_items }o--|| studios : "released by"
    media_items }o--o| series : "episode of"
    media_items ||--o{ media_item_markers : "positions"
    collections ||--o{ collection_items : holds
    collection_items }o--|| media_items : references
    profiles ||--o{ profile_item_state : "rates · favourites · hides"
    profiles ||--o{ playback_states : "resume points"
    profiles ||--o{ watch_log : history
    profiles ||--o{ bookmarks : saves
    profiles ||--o{ o_events : counts
    profiles ||--o{ profile_performer_state : follows
    profiles ||--o{ profile_studio_state : follows
    scan_jobs }o--|| libraries : "runs over"

    media_items {
        int id
        text title
        text title_source
        timestamp triaged_at
        timestamp organised_at
        int duration_seconds
        text tpdb_scene_id
        timestamp missing_since
    }
```

### Scanning a folder

```mermaid
sequenceDiagram
    autonumber
    participant S as Scan schedule / Rescan button
    participant P as Scanner pipeline
    participant FS as Video folders (read-only)
    participant FF as ffprobe / ffmpeg
    participant DB as PostgreSQL

    S->>P: start scan job
    P->>DB: insert scan_job (running)
    P->>FS: walk library roots
    loop each video file
        P->>FS: read and hash contents
        P->>DB: look up hash
        alt known hash at a new path
            P->>DB: update path (moved or renamed)
        else new file
            P->>P: parse performer, studio, date, title from path
            P->>FF: probe duration and streams
            P->>DB: insert media_item (waits in Inbox)
        end
    end
    P->>DB: mark files that weren't found as missing
    P->>FF: generate posters, previews, seek sprites
    P->>DB: scan_job completed
```

### Playing and casting a video

```mermaid
sequenceDiagram
    autonumber
    actor U as You
    participant W as Web app
    participant A as API server
    participant DB as PostgreSQL
    participant FS as Video file
    participant TV as Chromecast / AirPlay

    U->>W: open a video
    W->>A: GET item details (session cookie)
    A->>DB: check profile visibility and vault lock
    A-->>W: details, positions, resume point
    W->>A: GET stream (Range: bytes=…)
    A->>FS: read the requested byte range
    A-->>W: 206 Partial Content (MP4, no transcoding)
    loop while playing
        W->>A: save progress
        A->>DB: playback_states, watch_log, heatmap
    end
    opt cast to TV
        W->>A: request a cast link
        A-->>W: signed URL (one video, 6 hours)
        W->>TV: hand over the URL
        TV->>A: GET stream with token
        A->>FS: read byte range
        A-->>TV: 206 Partial Content
    end
```

### A video's life in the library

```mermaid
stateDiagram-v2
    [*] --> Inbox: found by a scan
    Inbox --> Library: approved (triaged)
    Library --> Organised: marked organised
    Organised --> Library: edited again
    Library --> Hidden: moved to a vault
    Hidden --> Library: removed from the vault
    Library --> Missing: file not found on a scan
    Organised --> Missing: file not found on a scan
    Missing --> Library: file found again (same hash)
    Missing --> [*]: forgotten in cleanup
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

---

## Running it

You need Docker.

```bash
git clone git@github.com:atelierlavee/arclight.git
cd arclight
make up
```

Open <http://localhost:3000>, create your account, then add your video folders
under **Settings → Library**. ffmpeg and PostgreSQL run inside the containers,
so there's nothing else to install. Run `make` on its own to see the other
commands. If port 3000 is taken, use `APP_PORT=3001 make up`.

### Configuration

These settings are optional and go in `docker/.env` (copy `.env.example` to
start):

| Variable | What it does | Default |
|---|---|---|
| `MEDIA_ROOT` | Your library, mounted read-only | `./media-placeholder` |
| `HOME_ROOT` | What the in-app folder picker can browse | your home folder |
| `BACKUP_DIR` | Where backups are written and restores are read from | `../backups` |
| `STASHDB_API_KEY` | Turns on StashDB lookups | — |
| `TPDB_API_KEY` | Turns on ThePornDB positions | — |
| `WEBAUTHN_ORIGIN` | Addresses allowed to use Touch ID and passkeys | `http://localhost:5173,http://localhost:3000` |
| `LAN_HOST` | This machine's wifi address, used for the phone link | detected by `make up` |

Everything else is set in the app under **Settings**.

### From a phone or TV

Turn on **Settings → Server → Local network access**. It shows the address and
a QR code to scan with your phone.

---

## Naming

```
<library root>/<Performer>/<Studio>/[Studio] Performer 1, Performer 2 - MM.DD.YYYY - Title.mp4
```

- If a filename starts with `[`, it's read using the pattern above. Everything
  except the studio is optional. Listing two performers credits both.
- Otherwise, the folder name gives the performer, and a `[Bracket]` anywhere in
  the filename gives the studio.
- Dates can be `MM.DD.YYYY` or `YYYY.MM.DD`.
- Images next to a video become its gallery.
- The Inbox suggests a filename in this format, with a copy button.

When sources disagree, Arc Light uses the first one it finds in this order:
your edit in the app, the `[Studio]` at the start of the filename, the studio
folder, then a bracket elsewhere in the name.

## Formats

**Arc Light plays MP4 files (`.mp4`, `.m4v`) as they are on disk and never
transcodes.** Other video formats (`mkv`, `avi`, `mov`, `webm`, `wmv` and so
on) are still scanned and get posters and previews, but you'll need to convert
them yourself to watch them. Supported photo formats are `jpg`, `png`, `gif`,
`webp` and `heic`.

## Backups

**Settings → Server → Backup** writes a single `.tar.gz` file. It contains the
whole database and your uploaded images: edits, tags, ratings, collections,
watch history, categories, appearance settings, and each profile's pins,
searches and recent items. Posters and previews aren't included, because a
scan rebuilds them. Backups can also run on a schedule.

**Restore** sits next to each backup in the list. It takes a snapshot of the
current library first, then applies the backup in one database transaction, so
if anything fails nothing changes. It refuses backups made by a newer version
of Arc Light.

**To move to a new machine:**
1. Copy the backup file into `backups/`.
2. Run `make up`.
3. Create a throwaway account.
4. Restore the backup.
5. Sign in with your original account and run a scan.

Backups don't include the videos themselves, `docker/.env` (your API keys) or
sign-in sessions. Keep `BACKUP_DIR` on another drive or in a synced folder.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl/Cmd + K` | Search |
| `Ctrl/Cmd + Shift + H` | Discreet mode |
| `Ctrl/Cmd + Shift + ,` | Appearance panel |
| `Ctrl/Cmd + \` | Fold the sidebar |
| `Space` / `K` | Play or pause |
| `←` `→` / `↑` `↓` | Skip 10 seconds / change volume |
| `0`–`9` | Jump to that tenth of the video |
| `[` `]` | Previous / next position |
| `F` `M` `B` `O` `S` `G` | Fullscreen, mute, bookmark, O-counter, subtitles, contact sheet |
| `J` `K` `L` `Enter` | In the Feed: next, previous, like, open |

The full list is in the app at `/help`.

---

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

## Design choices

- **One account, several profiles.** Arc Light is for one household, not a
  multi-user service.
- **No transcoding.** Only MP4 is playable, which keeps the server light and
  playback instant.
- **No native app.** The web app is designed to work well on phones instead.
- **The filesystem is the source of truth.** The database adds your edits and
  history on top of your files. It never replaces them.

## License

Copyright 2026 Vivek Jaiswal. Licensed under the [Apache License 2.0](LICENSE).

You're free to use, modify and share Arc Light. If you share it or anything
built from it, you must keep the [LICENSE](LICENSE) and [NOTICE](NOTICE) files
and the attribution to the original author.
