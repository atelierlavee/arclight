# Arc Light

A self-hosted organiser for an adult video collection. Point it at your
folders and it works out performers, studios, release dates and titles from
how the files are named, then gives you a private, cinematic library over the
top.

**Your filesystem is the source of truth.** Files are opened read-only and
nothing is uploaded. The only outside lookups are optional (StashDB and
ThePornDB, with your own API keys), and they run only when you ask.

## Features

**Library**
- Scans the folders you choose, on demand or on an interval. New videos wait
  in an **Inbox** until you approve them
- Reads performers, studios, dates and titles from paths and filenames (see
  [Naming](#naming)). Your edits always win over the scanner
- Recognises moved and renamed files by content hash, so nothing is lost
- Tags (with parent tags), favourites, 1–5 stars, an O-counter, watch later,
  private notes, manual and smart collections, saved searches and pins
- Categories filed by studio: each studio, or its network, names a home tile
  (Glamour, Hardcore, Cinematic…). A video you file by hand stays put
- Bulk edits, albums with slideshow, series, studio networks, and a graph of
  who works with whom
- Optional StashDB lookups for cast, studio, tags and descriptions, and
  ThePornDB positions ("Missionary 15:21") on the seek bar

**Watching**
- A full-page player: details, positions as chips, the folder's stills,
  your queue and *Up next*. While it plays, *In this scene* shows the cast
- Hover previews, a seek-bar thumbnail strip, a replay heatmap, bookmarks,
  a contact sheet of frames (`G`), subtitles from `.srt`/`.vtt`
- Lean back: shuffle a studio, album or search into a hands-free queue
- Casts to Chromecast or AirPlay, and works on a phone over your wifi

**Pages**
- **Home** — full-bleed scenes: the featured video, your categories as
  posters, keep watching, a mood picker that plays a scene inside the word,
  new from who you follow, just added
- **Performers** — a centre-stage page each: banner, fact sheet, *Roulette*
  (spin and it plays a random scene), *Often with*, and their videos by
  studio, all, or on a timeline. Ages are never shown
- **Feed** — a post for every new video from the performers and studios you
  follow, with suggestions of who else to follow
- **Your stats** — a year in review, an activity diary and a tier list

**Privacy**
- Profiles with their own PIN, history, favourites, stats and settings; only
  the owner manages the library
- A vault per profile, hidden everywhere until unlocked with its PIN or a passkey
- Lock-on-open with a password or Touch ID
- **Discreet mode** (`Ctrl/Cmd + Shift + H`) blurs every image instantly, and
  needs your privacy password or Touch ID to turn off. It stops a glance over
  your shoulder, not someone with access to your machine
- Local network access is off unless you turn it on

## Running it

Requires Docker.

```bash
git clone git@github.com:atelierlavee/arclight.git
cd arclight
make up
```

Open <http://localhost:3000>, create your account, then add your video folders
under **Settings → Library**. ffmpeg and Postgres are inside the containers;
nothing else needs installing. `make` lists the other commands. Port taken?
`APP_PORT=3001 make up`.

### Configuration

Optional, in `docker/.env` (start from `.env.example`):

| Variable | Meaning | Default |
|---|---|---|
| `MEDIA_ROOT` | Your library, mounted read-only | `./media-placeholder` |
| `HOME_ROOT` | What the in-app folder picker can browse | your home folder |
| `BACKUP_DIR` | Where backups go, and where restores are read from | `../backups` |
| `STASHDB_API_KEY` | Enables StashDB lookups | — |
| `TPDB_API_KEY` | Enables ThePornDB positions | — |
| `WEBAUTHN_ORIGIN` | Origins allowed for Touch ID and passkeys | `http://localhost:5173,http://localhost:3000` |
| `LAN_HOST` | This machine's wifi address, for the phone link | detected by `make up` |

Everything else is set in the app under **Settings**.

### From a phone or TV

Turn on **Settings → Server → Local network access**; it shows the address
and a QR code. Casting hands the TV a signed six-hour link to that one video.

## Naming

```
<library root>/<Performer>/<Studio>/[Studio] Performer 1, Performer 2 - MM.DD.YYYY - Title.mp4
```

- A filename starting with `[` uses the convention above; everything but the
  studio is optional, and listing two performers credits both
- Otherwise the folder names the performer and a `[Bracket]` anywhere names
  the studio
- Dates are `MM.DD.YYYY` or `YYYY.MM.DD`
- Images beside a video become its gallery
- The inbox suggests a filename in this format, with a copy button

When sources disagree: your edit in the app, then the filename's `[Studio]`,
then the studio folder, then a bracket elsewhere in the name.

## Formats

**Arc Light plays MP4** (`.mp4`, `.m4v`) as it sits on disk and never
transcodes. Other formats (`mkv`, `avi`, `mov`, `webm`, `wmv`…) are still
scanned and get posters and previews, but you'll need to convert them to
watch. Photos: `jpg`, `png`, `gif`, `webp`, `heic`.

## Backups

**Settings → Server → Backup** writes one `.tar.gz` with the whole database
and your uploaded images: edits, tags, ratings, collections, watch history,
categories, appearance, and each profile's pins, searches and recents.
Posters and previews are left out, because a scan rebuilds them.

**Restore** sits beside each archive. It snapshots the current library first,
applies in one transaction (a failure changes nothing), and refuses archives
from a newer version. To move machines: copy the archive into `backups/`,
`make up`, create a throwaway account, restore, sign in, and scan.

Not backed up: the videos, `docker/.env` (your API keys) and sign-in
sessions. Keep `BACKUP_DIR` on another drive or a synced folder.

## Keyboard

| | |
|---|---|
| `Ctrl/Cmd + K` | Search |
| `Ctrl/Cmd + Shift + H` | Discreet mode |
| `Ctrl/Cmd + Shift + ,` | Appearance panel |
| `Ctrl/Cmd + \` | Fold the sidebar |
| `Space` / `K` | Play or pause |
| `←` `→` / `↑` `↓` | Skip 10 s / volume |
| `0`–`9` | Jump to that tenth of the video |
| `[` `]` | Previous / next position |
| `F` `M` `B` `O` `S` `G` | Fullscreen, mute, bookmark, count, subtitles, contact sheet |
| `J` `K` `L` `Enter` | Feed: next, previous, like, open |

The full list is at `/help`.

## Development

| | |
|---|---|
| Server | Node 22, TypeScript, Fastify, PostgreSQL 17, Drizzle |
| Web | React 19, Vite, TanStack Router and Query, Tailwind 4 |
| Media | ffmpeg / ffprobe, sharp |

`make dev` runs the server and Vite in containers with the source mounted;
the web app is on <http://localhost:5173>.

- The API is documented at `/api/docs`
- Migrations: `npm run db:generate -w apps/server`, applied on boot
- Web tests: `npm test -w apps/web`
- `node_modules` is a container volume: add a dependency on the host, run
  `npm install` in the container too, then restart `app` and `web`
- Server tests need a throwaway Postgres and a scratch `APP_DATA_DIR`.
  **Never run them in the real `app` container**: they wipe uploaded images

```bash
docker run -d --rm --name media-test-pg -p 55432:5432 \
  -e POSTGRES_USER=media -e POSTGRES_PASSWORD=media -e POSTGRES_DB=media postgres:17-alpine
APP_DATA_DIR=$(mktemp -d) \
TEST_ADMIN_URL=postgres://media:media@localhost:55432/media \
TEST_DATABASE_URL=postgres://media:media@localhost:55432/media_test \
  npm test -w apps/server
docker stop media-test-pg
```

## Status

Built for one person's collection and used daily. One account, with profiles
for the people who share it. No transcoding, by design, and no native app:
the web app is laid out for phones instead.
