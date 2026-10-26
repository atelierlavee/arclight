# Plan: closing the feature gaps with Stash

*Written 2026-10-26. Based on Arc Light at commit `5b7bdb2` and Stash at
commit `d75aca9` (2026-10-25).*

## Background

Stash is the best-known self-hosted organiser for adult collections. Comparing
its full API with Arc Light's schema and code turned up twelve features Arc
Light does not have. Four of them were dropped (see below); this plan covers
the other eight in five phases. Phases keep their original numbers, so 3, 4, 5
and 8 are missing on purpose.

Each phase is built, tested and committed to `main` separately, and each one
is usable on its own, so the work can stop after any phase.

### What stays the same

- **MP4 only, never transcode.** Nothing in this plan converts, remuxes or
  re-encodes video.
- **No metadata from the internet.** Nothing here downloads data or sends
  anything off the machine.
- **Files stay read-only.** No feature moves, renames or deletes files on
  disk.

### What is left out on purpose

| Stash feature | Why it is not in this plan |
|---|---|
| StashDB and scrapers | Breaks "no metadata from the internet". It could come later as an opt-in exception, but only if you decide to allow it. |
| Transcoding | Ruled out by the MP4-only policy. |
| Moving or deleting files | Files are opened read-only on purpose. |
| DLNA, plugins, SQL console, interactive devices, log viewer | Useful in a large community project, not worth the upkeep in a personal app. |
| Merging performers, tags and studios (was Phase 3) | The library is named neatly, so duplicate records do not arise. |
| Scene markers (was Phase 4) | Every marker would be tagged by hand, with nothing to fill them in automatically, so the marker wall would stay patchy. Bookmarks already cover "remember this moment". |
| Aliases for performers, tags and studios | Built in Phases 1–2, then removed (migration 0050). Names are managed by hand; no other spellings are matched. |
| Duplicate-video finder (was Phase 5) | Same reason: no duplicate files to find. |
| Filename-parsing tool (was Phase 8) | Files are already named the way the scanner reads them. |

## The eight gaps

| # | Missing feature | Arc Light today | Phase |
|---|---|---|---|
| 3 | Richer performer profiles: birthdate, age per scene, attributes | Name, bio, images | 1 |
| 4 | Tag hierarchy | Flat tags with name and colour | 2 |
| 5 | Studio hierarchy (networks and sites) | Name only | 2 |
| 7 | Filtering by technical details and performer attributes | Tags, rating, plays, duration | 6 |
| 8 | "Organised" flag | Inbox triage is close but not the same | 6 |
| 9 | O-counter with history | Play count only | 6 |
| 10 | Subtitles | None | 7 |
| 12 | JSON export and import of metadata | Full database backup only | 9 |

## Rules every phase follows

These follow from how the code already works:

- **Owner or profile.** Every new write route goes into `OWNER_ONLY_ROUTES` in
  `apps/server/src/auth/ownerRoutes.ts` or is classified as a profile route;
  the existing test fails otherwise. Library facts (tags, performer details) belong to the owner. Personal things (O-count) belong to each
  profile.
- **Vault.** Every new list, search or filter goes through `visibleItems`
  (`apps/server/src/library/visibility.ts`), so hidden items never leak through
  filters.
- **Your edits win.** Anything set by hand is recorded with `source = 'user'`,
  so the scanner never overwrites it.
- **One migration per phase**, starting at 0048, generated with drizzle-kit.
- **Each phase ships with** API tests, an Activity log entry for anything
  destructive, a README update and one commit to `main`.

---

## Phase 1: Richer performer profiles

**Size:** medium

**Database**

- New columns on `performers`: gender, birthdate, country, ethnicity, hair
  colour, eye colour, height, measurements, tattoos, piercings, career start
  year, career end year.

**Computed**

- A performer's age in each scene, from their birthdate and the video's
  release date.

**UI**

- An edit form on the performer page.
- Age at the time of the scene on the video's detail view.

---

## Phase 2: Tag and studio hierarchy

**Size:** medium

**Database**

- A `tag_parents` table (a tag may have several parents), `studios.parent_id`,
  `tags.description`.

**Behaviour**

- Filtering by a parent includes all its children, using a recursive query.
  "Outdoor" includes "Beach"; a network includes all its sites.

**UI**

- A parent picker for tags and studios.
- Tag pages list their child tags.
- Studio pages list their sites.

---

## Phase 6: Filters, Organised flag and O-counter

**Size:** medium

**Organised**

- An `organised` flag on videos, set by the owner.
- A "Not organised" view for working through untagged videos.

**O-counter**

- Per profile: an `o_count` column in `profile_item_state` and a history table
  with timestamps.
- A player button and a keyboard shortcut to add one.
- Shown in Your Stats (totals, top videos, top performers) and in
  achievements.

**New smart-collection rules**

- Video: resolution, codec, organised, O-count.
- People and studios: performer age, performer attributes from Phase 1,
  studio including its child studios.
- Resolution and codec already sit in `extra_metadata`. Bitrate is added
  during the scan.

---

## Phase 7: Subtitles

**Size:** small

- The scanner picks up `.vtt` and `.srt` files with the same name as the
  video. A suffix such as `movie.en.srt` sets the language.
- `.srt` is converted to WebVTT when served. That changes a text file's
  format only; the video is untouched, so it does not conflict with the
  MP4-only rule.
- Subtitles are added to the player as browser text tracks, with a CC button
  and a `C` keyboard shortcut.

---

## Phase 9: JSON export and import

**Size:** small

**Export**

- Performers, studios, tags and each video's metadata, keyed by
  content hash, so the export survives moved files and a move to another
  machine.

**Import**

- Matches videos by content hash.
- Leaves your own edits alone unless you choose to overwrite them.
- Profile data is optional.

This complements backups: an export can be read, compared between versions
and partly re-imported, which a full backup cannot.

---

## Order

1 → 2 → 6 → 7 → 9

- **Phases 1–2** are done.
- **Phase 6 next.** Filters, the Organised flag and the O-counter work on the
  library as it is, with no tagging needed first.
- **Phases 7 and 9 last.** Phase 7 is only worth doing if some videos have
  subtitle files beside them.

## Decisions

| Question | Decision |
|---|---|
| Tag parents | A tag may have several parents. A studio has at most one. |
| Performer fields | The Phase 1 list as written. |
| Merging, duplicate finder, filename tool, aliases | Dropped: the library is neatly organised. |
| Scene markers | Dropped: hand-tagged only, so never complete. |

## Progress

- **Phase 1** — done, commit `b643a7c`.
- **Phase 2** — done, commit `b7157ef`.
- **Phase 6** — next.

## Picking this up on another machine

- Run `make up` to rebuild. Migrations 0048 and 0049 run on start.
- Server tests need a throwaway Postgres; the README's *Tests* section has
  the exact commands. Never run them inside the app container.
- Two server tests fail on `main` from before this work started, so a run
  that shows only these is clean:
  - `scanner/walk.test.ts` — "skips symlinks entirely"
  - `api/routeCoverage.test.ts` — "no GET mentions a hidden item", which
    times out at 5 s on a slower machine, for the owner, the guest or both
