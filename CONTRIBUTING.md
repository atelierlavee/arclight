# Contributing to Arc Light

Thanks for helping. This guide covers what you need to make a change and get
it merged. For how the code is put together, read
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first.

## Ground rules

Arc Light has a few fixed principles. Pull requests that go against them
won't be merged, however well they're written.

- **The library is read-only.** The app never writes to, moves, renames or
  deletes a user's media files. The only writable mounts are the app data
  directory and the backups directory.
- **Keep originals read-only.** Browser-compatible videos play directly;
  incompatible formats may be transcoded on demand into temporary playback
  segments. Never write converted files beside or over a library file.
- **Offline by default.** Nothing leaves the machine unless the user has set an
  API key *and* asked for a lookup. Don't add analytics, telemetry or calls to
  outside services.
- **One household, not a multi-user service.** There's one account, with
  profiles for the people who share it.
- **Your edits win.** Anything a user changes in the app must survive a
  rescan. Fields the scanner fills in track their source (for example
  `titleSource`, `seriesSource`) for this reason.

### Content rule

This is an organiser for adult media, so **never commit real media**. That
includes videos, screenshots or thumbnails of real scenes, real performer
names or images, or real filenames from anyone's library. Tests and docs use
synthetic data only: generated test videos, placeholder names and made-up
studios. Screenshots in pull requests must use placeholder content, or be
blurred with discreet mode (`Ctrl/Cmd + Shift + H`).

## Setting up

You need Docker, Node 22 and npm.

```bash
git clone git@github.com:atelierlavee/arclight.git
cd arclight
npm install
cp .env.example docker/.env   # optional: set MEDIA_ROOT to a folder of test videos
make dev
```

- The web app (Vite, with hot reload) runs at <http://localhost:5173>.
- The API server reloads when you edit and listens on port 3000.
- API documentation is at <http://localhost:3000/api/docs>.
- Run `make` on its own to list every command.

**Dependencies:** `node_modules` lives in a container volume. After adding a
package, run `npm install` on your machine *and* inside the container, then
restart the `app` and `web` containers.

## Project layout

```
apps/server/   Fastify API, scanner, media pipeline (TypeScript)
apps/web/      React single-page app
docker/        Compose files for production and development
docs/          Architecture and planning notes
scripts/       Icon generation, restore helper
```

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains each folder.

## Making a change

1. **Open an issue first** for anything larger than a small fix, so we can
   agree on the approach before you write it.
2. **Create a branch** from `main`.
3. **Make the change, with tests** (see below).
4. **Run the checks** locally (see [Checks](#checks)).
5. **Open a pull request.** The template will ask what changed, how you tested
   it, and for screenshots if the UI changed.

### Commit messages

Write one short sentence in the imperative that describes what the user gets,
not which files changed:

```
Add a watch diary
Jump between positions with [ and ]
Say so when a contact sheet's video drive isn't connected
```

Use the body, if needed, to explain *why*.

### License headers

Every source file starts with:

```ts
// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0
```

Add it to any new `.ts`, `.tsx` or `.js` file. By contributing, you agree that
your contribution is licensed under the [Apache License 2.0](LICENSE).

## Code conventions

### Comments explain why

The codebase is heavily commented, but the comments explain *reasons*, not
mechanics. A good comment tells the next person the constraint or the bug that
shaped the code ("the session cookie is SameSite=Lax, and 'site' ignores the
port, so…"). Keep this up. If you had to work something out, write it down
where the code is.

### Server

- **One file per feature in `src/api/`**, exporting an `xxxRoutes(app)`
  function that's registered in `buildApp.ts`.
- **Every route is private by default.** The global auth guard
  (`auth/guard.ts`) requires a session for every `/api` route except a short
  public list.
- **Decide who may call each new route.** Library-wide changes (folders,
  scans, backups, cleanup, settings) belong to the owner, so add them to
  `OWNER_ONLY_ROUTES` in `auth/ownerRoutes.ts`. Per-profile actions (ratings,
  bookmarks, history, vault) go in `PROFILE_ROUTES` in the same file, with a
  one-line reason. `api/profiles.test.ts` fails if a non-GET route is in
  neither list.
- **Never filter visibility by hand.** Use the helpers in
  `library/visibility.ts` (`visibleItems`, `itemReachable`, `hiddenGate`) for
  any query that returns media. They handle vault items, missing files, folders
  that are no longer scanned, and items still in the Inbox.
  `api/hiddenLeaks.test.ts` checks that vault items don't leak. Add your
  endpoint to it if it returns media.
- **Scope per-profile data with `profileId(request)`.** One profile must never
  see another's history, ratings or bookmarks.
- **Cap and clean input.** Trim strings, cap lengths and list sizes, and parse
  ids with `parseId`. See `api/bookmarks.ts` for the pattern.

### Database

- The schema lives in `apps/server/src/db/schema.ts` (Drizzle).
- After changing it, generate a migration:
  ```bash
  npm run db:generate -w apps/server
  ```
  Commit the generated SQL in `src/db/migrations/` with the schema change.
  Migrations run automatically when the server starts.
- Never edit a migration that has already been merged. Add a new one.
- Backups must keep working: a change that adds user data should be included
  in backup and restore.

### Web

- **Pages** live in `src/pages/` and are wired up in `src/router.tsx`
  (TanStack Router).
- **API calls** live in `src/lib/*Api.ts` as TanStack Query hooks. Query keys
  come from `lib/queryKeys.ts`, so invalidation stays consistent.
- **Shared UI** lives in `src/components/`. Styling uses Tailwind CSS 4.
- **Pure logic** (layout maths, filters, formatting) goes in `src/lib/` as
  plain functions with their own tests.
- Pages must work on a phone. There's no native app.
- Any new images must respect discreet mode.

## Tests

### Web

```bash
npm test -w apps/web
```

Vitest with Testing Library and jsdom. Tests sit next to the file they test
(`Foo.tsx` → `Foo.test.tsx`).

### Server

Server tests run against a **real PostgreSQL**, not a mock, because the bugs
that have reached production here were ones only the real database showed.

```bash
docker run -d --rm --name media-test-pg -p 55432:5432 \
  -e POSTGRES_USER=media -e POSTGRES_PASSWORD=media -e POSTGRES_DB=media postgres:17-alpine
TEST_ADMIN_URL=postgres://media:media@localhost:55432/media \
TEST_DATABASE_URL=postgres://media:media@localhost:55432/media_test \
  npm test -w apps/server
docker stop media-test-pg
```

- The test run refuses to start unless the database is named `media_test`,
  because it empties every table.
- Uploads and backups go to a throwaway temp directory, set up by
  `vitest.config.ts`.
- **Never run the server tests inside the real `app` container.** They delete
  artwork and run restores.
- Video tests need `ffmpeg` installed. Backup tests need `pg_dump` 17.
- Build test data with the helpers in `src/test/fixtures.ts` (`makeItem`,
  `makePerformer`, …), and use `src/test/harness.ts` for `testApp()`,
  `signIn()` and `resetDatabase()`. Each test should create only the rows it
  depends on.

## Checks

CI (`.github/workflows/ci.yml`) runs on every pull request. Run the same
checks locally before you push:

```bash
npm run build -w apps/web        # type-check and build the web app
npm run lint -w apps/web         # oxlint
npm test -w apps/web
npx tsc --noEmit -p apps/server/tsconfig.json
npm test -w apps/server          # with the test database above
```

CI also checks that the Docker image builds.

## Reporting bugs and security issues

- **Bugs and feature ideas:** open a GitHub issue using a template. Leave out
  anything from your real library.
- **Security issues:** don't open a public issue. See [SECURITY.md](SECURITY.md).

## Code of conduct

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).
