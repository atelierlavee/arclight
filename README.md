# Arc Light

**Arc Light is a self-hosted, private organiser and player for an adult video
collection.** You run it on your own computer with Docker, point it at your
video folders, and it gives you a browsable library on top: performers,
studios, categories, collections and a full-screen player. You can use it on
the same machine, or on a phone or TV over your home wifi.

**Your files stay where they are.** Arc Light opens your library read-only and
never moves, renames or uploads anything. Outside lookups (StashDB and
ThePornDB) are optional, use your own API keys, and run only when you ask.

## Features

- **Organising.** Scans the folders you choose and reads performers, studios,
  dates and titles from the file names. New videos wait in an Inbox for your
  approval. Your edits always win over the scanner.
- **Your library, your way.** Tags, ratings, favourites, notes, bookmarks,
  collections (manual or rule-based), categories, series and albums.
- **Watching.** A full-page player with hover previews, a seek-bar thumbnail
  strip, subtitles, a queue, and position markers from ThePornDB. Casts to
  Chromecast or AirPlay.
- **Discovery.** Performer and studio pages, a feed of new videos from who you
  follow, and personal stats.
- **Privacy.** Profiles with their own PINs, a hidden vault per profile, lock
  on open with a password or Touch ID, and a discreet mode that blurs every
  image instantly (`Ctrl/Cmd + Shift + H`).

## Running it

You need Docker.

```bash
git clone git@github.com:atelierlavee/arclight.git
cd arclight
make up
```

Open <http://localhost:3000>, create your account, then add your video folders
under **Settings → Library**. Run `make` on its own to see the other commands.
If port 3000 is taken, use `APP_PORT=3001 make up`.

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

Everything else is set in the app under **Settings**. To use a phone or TV,
turn on **Settings → Server → Local network access**, which shows the address
and a QR code.

## Naming

```
<library root>/<Performer>/<Studio>/[Studio] Performer 1, Performer 2 - MM.DD.YYYY - Title.mp4
```

- If a filename starts with `[`, it's read using the pattern above. Everything
  except the studio is optional.
- Otherwise, the folder name gives the performer, and a `[Bracket]` anywhere in
  the filename gives the studio.
- Dates can be `MM.DD.YYYY` or `YYYY.MM.DD`. Images next to a video become its
  gallery.

## Formats

**Arc Light plays MP4 files (`.mp4`, `.m4v`) as they are and never
transcodes.** Other formats are still scanned and get posters, but you'll need
to convert them to watch them.

## Backups

**Settings → Server → Backup** saves the database and your uploaded images as
one `.tar.gz` file. Restore sits next to each backup. It takes a snapshot of
the current library first, and changes nothing if the restore fails. Your
videos and `docker/.env` aren't included in backups.

## More

- Keyboard shortcuts are listed in the app at `/help`.
- [Architecture](docs/ARCHITECTURE.md): how the code is put together.
- [Contributing](CONTRIBUTING.md): setup, conventions, tests and pull requests.
- [Security](SECURITY.md): the security model and how to report a problem.
- [Code of Conduct](CODE_OF_CONDUCT.md)

## License

Copyright 2026 atelierlavee. Licensed under the [Apache License 2.0](LICENSE).
If you share Arc Light or anything built from it, you must keep the
[LICENSE](LICENSE) and [NOTICE](NOTICE) files and the attribution.
