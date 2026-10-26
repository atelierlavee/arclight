# Plan: closing the feature gaps with Stash

*Written 2026-10-26. Based on Arc Light at commit `5b7bdb2` and Stash at
commit `d75aca9` (2026-10-25).*

## Background

Stash is the best-known self-hosted organiser for adult collections. Comparing
its full API with Arc Light's schema and code turned up twelve features Arc
Light does not have. This plan covers all twelve in nine phases.

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

## The twelve gaps

| # | Missing feature | Arc Light today | Phase |
|---|---|---|---|
| 1 | Scene markers: tagged moments, searchable, with a marker wall | Personal bookmarks with label and note | 4 |
| 2 | Duplicate finder by appearance (perceptual hash) | Exact content hash only | 5 |
| 3 | Richer performer profiles: aliases, birthdate, age per scene, attributes | Name, bio, images | 1 |
| 4 | Tag hierarchy and aliases | Flat tags with name and colour | 2 |
| 5 | Studio hierarchy (networks and sites) and aliases | Name only | 2 |
| 6 | Merging performers, tags and studios | None | 3 |
| 7 | Filtering by technical details and performer attributes | Tags, rating, plays, duration | 6 |
| 8 | "Organised" flag | Inbox triage is close but not the same | 6 |
| 9 | O-counter with history | Play count only | 6 |
| 10 | Subtitles | None | 7 |
| 11 | Filename-parsing tool with patterns | Fixed parsing rules in the scanner | 8 |
| 12 | JSON export and import of metadata | Full database backup only | 9 |

## Rules every phase follows

These follow from how the code already works:

- **Owner or profile.** Every new write route goes into `OWNER_ONLY_ROUTES` in
  `apps/server/src/auth/ownerRoutes.ts` or is classified as a profile route;
  the existing test fails otherwise. Library facts (tags, markers, performer
  details) belong to the owner. Personal things (O-count) belong to each
  profile.
- **Vault.** Every new list, search or filter goes through `visibleItems`
  (`apps/server/src/library/visibility.ts`), so hidden items never leak through
  duplicates, markers or filters.
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
- New `performer_aliases` table. Names and aliases are unique together,
  ignoring case, so one name can never point at two performers.

**Scanner**

- A file that names "Jane D." links to Jane Doe when "Jane D." is one of her
  aliases, instead of creating a new performer.

**Computed**

- A performer's age in each scene, from their birthdate and the video's
  release date.

**UI**

- An edit form on the performer page.
- Age at the time of the scene on the video's detail view.

---

## Phase 2: Tag and studio hierarchy and aliases

**Size:** medium

**Database**

- A `tag_parents` table (a tag may have several parents), `studios.parent_id`,
  `tags.description`.
- New `tag_aliases` and `studio_aliases` tables.

**Behaviour**

- Filtering by a parent includes all its children, using a recursive query.
  "Outdoor" includes "Beach"; a network includes all its sites.
- The scanner resolves studio aliases the same way as performer aliases.

**UI**

- A parent picker and alias editing for tags and studios.
- Tag pages list their child tags.
- Studio pages list their sites.

---

## Phase 3: Merging

**Size:** medium

Merge performers, tags or studios. Owner only. Each merge runs in one
transaction:

- **Video links** move from the source to the target. When a video is linked
  to both, the duplicate link is dropped.
- **Profile state:** each profile's favourites are combined.
- **Albums** and their covers are re-pointed to the target.
- **Smart collections** whose rules name the source are rewritten to name the
  target.
- **The source's name becomes an alias** of the target, so future scans keep
  linking correctly.

The UI shows a preview ("moves 42 videos, 3 albums") before you confirm.

---

## Phase 4: Scene markers

**Size:** large

**Database**

- New `scene_markers` table: video, start time, optional end time, primary
  tag, extra tags, optional title.
- Markers are library-wide and edited by the owner, because they describe the
  content, like tags do. Bookmarks stay personal.

**Player**

- Markers show as ticks on the seek bar.
- A list beside the player jumps to each one.
- `Shift+B` adds a marker at the current moment.
- A bookmark can be turned into a marker.

**Marker wall**

- A page that plays only the marked moments, filtered by tag.
- It plays the original MP4 from the marker's timestamp. No clips are
  generated and nothing is transcoded.

**Search and smart collections**

- Search by marker tag.
- New smart-collection rule: "has a marker tagged X".

---

## Phase 5: Duplicate finder by appearance

**Size:** large

**Fingerprint**

- A 64-bit perceptual hash per video, using the same algorithm as Stash: 25
  frames at 160 px wide, laid out in a 5×5 grid, then a DCT hash.
- Matching Stash exactly keeps the hashes compatible with StashDB, in case
  you ever decide to use it.
- Built with ffmpeg and `sharp`, which the app already uses.
- Stored in a new `media_files.phash` column.

**When it runs**

- During the scan, for new files.
- As a background job for the existing library, which can be paused and
  resumed.

**Matching**

- Two videos match when their hashes differ by only a few bits and their
  durations are close.

**Duplicates page**

- Shows each group of matches side by side with resolution, codec, size and
  bitrate.
- **Mark as the same scene:** links them like the existing quality variants.
- **Not a duplicate:** remembered, so that pair is not shown again.
- No delete button. If you want a copy gone, remove it from disk yourself.

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

- Video: resolution, codec, organised, O-count, has markers.
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

## Phase 8: Filename-parsing tool

**Size:** medium

- An owner page where you type a pattern, for example
  `{studio} - {performer} & {performer} - {date} - {title}`.
- It previews the result for a chosen folder, showing exactly what would
  change, before anything is written.
- Applied values are saved as your edits, so later scans keep them.

---

## Phase 9: JSON export and import

**Size:** small

**Export**

- Performers, studios, tags, markers and each video's metadata, keyed by
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

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

- **Phases 1–3 first.** Aliases and the hierarchy make merging, scanning,
  filtering and markers all work better.
- **Phases 4–5 next.** Markers and the duplicate finder are the two largest
  visible features.
- **Phases 6–9 last.** Smaller additions built on top.

## Decisions

| Question | Decision |
|---|---|
| Markers | Library-wide, edited by the owner. Bookmarks stay personal. |
| Tag parents | A tag may have several parents. A studio has at most one. |
| Performer fields | The Phase 1 list as written. |
| Duplicate finder (Phase 5) | Deferred. Revisit later, including whether the hash is Stash-compatible. |
| Merging (Phase 3) | Undecided. Probably skip for now: the library's own filenames rarely produce duplicate names, and aliases (Phases 1–2) stop new ones. |

## Progress

- **Phase 1** — done, commit `b643a7c`.
- **Phase 2** — done, commit `b7157ef`.
- **Phase 3** — on hold (see Decisions).
- **Phase 4** — next, unless Phase 3 is picked up after all.

## Picking this up on another machine

- Run `make up` to rebuild. Migrations 0048 and 0049 run on start.
- Server tests need a throwaway Postgres; the README's *Tests* section has
  the exact commands. Never run them inside the app container.
- Two server tests fail on `main` from before this work started, so a run
  that shows only these is clean:
  - `scanner/walk.test.ts` — "skips symlinks entirely"
  - `api/routeCoverage.test.ts` — "no GET mentions a hidden item", which
    times out at 5 s on a slower machine, for the owner, the guest or both
- Optional check before deciding on Phase 3: a read-only query listing
  performer, studio and tag names that differ only in spaces, dots or
  capitals. If it finds almost nothing, skip merging.
