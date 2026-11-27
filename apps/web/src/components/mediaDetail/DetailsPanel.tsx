// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useLayoutEffect, useRef, useState } from "react";
import { Check, Move, Pencil } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PerformerEditor } from "../PerformerEditor";
import { ClampedText } from "../ClampedText";
import { DescriptionEditor } from "../DescriptionEditor";
import { FolderPicker } from "../FolderPicker";
import { GalleryStrip, useGalleryTotal } from "../GalleryStrip";
import { StudioEditor } from "../StudioEditor";
import { TagEditor } from "../TagEditor";
import { TechnicalInfoPanel } from "../TechnicalInfoPanel";
import { ThumbnailPicker } from "../ThumbnailPicker";
import { FramingEditor, type FramingValue } from "../FramingEditor";
import { BookmarkList } from "../BookmarkList";
import { NoteEditor } from "../NoteEditor";
import { PerformerAvatar } from "../PerformerAvatar";
import type { PerformerSummary } from "../PerformerCard";
import { StarRating } from "../StarRating";
import { circleStyle, fetchPerformer, performerPortraitUrl } from "@/lib/performerApi";
import { ChapterFrames } from "./ChapterFrames";
import type { Bookmark } from "@/lib/bookmarkApi";
import type { Marker } from "@/lib/markerApi";
import type { Category } from "@/lib/categoryApi";
import { setItemNote, thumbnailUrl, type MediaItemDetail, type VideoMetadata } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

/**
 * A stored date as the viewer's own calendar day. A bare "YYYY-MM-DD" is
 * read by JS as UTC midnight, which shows the previous day west of
 * Greenwich, so it is pinned to local time first.
 */
function formatDate(value: string): string {
  const local = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value;
  return new Date(local).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "1080p", "4K"… from the picture's shorter side, so a vertical video reads right. */
function qualityLabel(width?: number, height?: number): string | null {
  if (!width || !height) return null;
  const side = Math.min(width, height);
  if (side >= 2000) return "4K";
  if (side >= 1400) return "1440p";
  if (side >= 1000) return "1080p";
  if (side >= 700) return "720p";
  if (side >= 560) return "576p";
  if (side >= 460) return "480p";
  return `${side}p`;
}

const CODEC_NAMES: Record<string, string> = {
  h264: "H.264",
  hevc: "HEVC",
  h265: "HEVC",
  av1: "AV1",
  vp9: "VP9",
  vp8: "VP8",
  mpeg4: "MPEG-4",
  aac: "AAC",
  mp3: "MP3",
  opus: "Opus",
  vorbis: "Vorbis",
  ac3: "AC-3",
  eac3: "E-AC-3",
  dts: "DTS",
  flac: "FLAC",
};

/** The container as people call it, from ffprobe's comma-joined demuxer list. */
function containerLabel(format?: string): string | null {
  if (!format) return null;
  const names = format.toLowerCase().split(",");
  if (names.includes("mp4") || names.includes("mov")) return names.includes("mp4") ? "MP4" : "MOV";
  if (names.includes("matroska")) return "MKV";
  if (names.includes("webm")) return "WebM";
  if (names.includes("avi")) return "AVI";
  return names[0]?.toUpperCase() ?? null;
}

/**
 * The picture's quality at the far end of the overview's strip: "1080p",
 * then the codecs and container.
 */
function QualityBadge({ item }: { item: MediaItemDetail }) {
  const meta = (item.extraMetadata ?? {}) as VideoMetadata;
  const quality = qualityLabel(meta.width, meta.height);
  if (!quality) return null;
  const audio = meta.audioCodec && meta.audioCodec !== "none" ? meta.audioCodec : null;
  const detail = [
    meta.codec ? (CODEC_NAMES[meta.codec] ?? meta.codec.toUpperCase()) : null,
    audio ? (CODEC_NAMES[audio] ?? audio.toUpperCase()) : null,
    containerLabel(meta.containerFormat),
  ].filter(Boolean);
  return (
    <div className="ml-auto min-w-0 pl-8 text-right">
      <dt className="text-xs text-zinc-500">Quality</dt>
      <dd className="mt-1 flex h-6 items-center justify-end gap-1.5 text-[15px]">
        <span className="font-semibold text-zinc-100">{quality}</span>
        {detail.length > 0 && <span className="truncate text-zinc-500">· {detail.join(" · ")}</span>}
      </dd>
    </div>
  );
}

/**
 * One fact in the overview's strip: a small grey label over its value, a
 * hairline after it unless it is the last before the quality.
 */
function StripFact({
  label,
  last = false,
  children,
}: {
  label: string;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 px-8 first:pl-0", !last && "border-r border-white/[0.12]")}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 flex h-6 items-center truncate text-[15px] font-semibold text-zinc-100">{children}</dd>
    </div>
  );
}

/**
 * A few words about a performer under their name — how old they were in
 * this scene, where they're from, how many of their videos you have — from
 * the same cached record their page and the X-Ray strip read.
 */
function PerformerLine({ id, ageAtRelease }: { id: number; ageAtRelease?: number | null }) {
  const { data } = useQuery({ queryKey: qk.performer.detail(id), queryFn: () => fetchPerformer(id) });
  const parts = [
    ageAtRelease ? `${ageAtRelease} here` : null,
    data?.country,
    data ? `${data.videoCount} ${data.videoCount === 1 ? "video" : "videos"}` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <span className="sensitive block truncate text-[13px] text-zinc-500">{parts.join(" · ")}</span>;
}

/** Who's in it: a portrait, their name and a line about them; each opens their page. */
function PerformerCards({ performers }: { performers: MediaItemDetail["performers"] }) {
  // The same list the performer editor loads, so usually from the cache.
  const { data } = useQuery({
    queryKey: qk.performers.all,
    queryFn: async () => {
      const res = await fetch("/api/performers");
      if (!res.ok) throw new Error(`Failed to load performers: ${res.status}`);
      return (await res.json()) as { performers: PerformerSummary[] };
    },
  });
  const byId = new Map((data?.performers ?? []).map((p) => [p.id, p]));
  if (performers.length === 0) return <p className="text-sm text-zinc-500">Nobody named yet.</p>;
  return (
    <ul className="-mx-2 space-y-1">
      {performers.map((performer) => {
        const summary = byId.get(performer.id);
        return (
          <li key={performer.id}>
            <Link
              to="/performer/$performerId"
              params={{ performerId: String(performer.id) }}
              className="group flex items-center gap-3.5 rounded-2xl p-2 transition-colors hover:bg-white/[0.05]"
            >
              <PerformerAvatar
                name={performer.name}
                src={summary ? performerPortraitUrl(summary) : null}
                framing={summary ? circleStyle(summary) : undefined}
                className="size-12 shrink-0 ring-1 ring-white/10 transition-shadow group-hover:ring-2 group-hover:ring-white/40"
                fallbackClassName="text-base"
              />
              <span className="min-w-0">
                <span className="sensitive block truncate text-[15px] font-semibold text-zinc-100 group-hover:text-white">
                  {performer.name}
                </span>
                <PerformerLine id={performer.id} ageAtRelease={performer.ageAtRelease} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The tags, at most two lines of them. Measured rather than counted, since
 * how many fit depends on the words and the width: as many as fit, then a
 * "+N more" that opens the rest. Re-measured when the width changes.
 */
function TagLine({ tags, lines = 2 }: { tags: string[]; lines?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // How many fit, for the width and tags it was measured against; null
  // means "show them all and measure".
  const [measured, setMeasured] = useState<{ key: string; fit: number | null }>({ key: "", fit: null });
  const key = `${width}|${tags.join("\u0000")}`;
  const fit = measured.key === key ? measured.fit : null;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (expanded || !element || width === 0) return;
    const children = [...element.children] as HTMLElement[];
    const rows = [...new Set(children.map((child) => child.offsetTop))].sort((a, b) => a - b);
    if (rows.length <= lines) {
      if (measured.key !== key) setMeasured({ key, fit });
      return;
    }
    if (fit === 0) return;
    const lastRow = rows[lines - 1];
    // First pass, everything shown: stop one short of the first chip that
    // overflows, to leave room for "+N more". After that, one fewer at a
    // time until "+N more" itself sits on the last line.
    const next =
      fit === null
        ? Math.max(0, children.findIndex((child) => child.offsetTop > lastRow) - 1)
        : fit - 1;
    setMeasured({ key, fit: next });
  });

  if (tags.length === 0) return <p className="text-sm text-zinc-500">No tags yet.</p>;
  const shown = expanded || fit === null ? tags : tags.slice(0, fit);
  const chip = "rounded-full px-3 py-1 text-[13px]";
  return (
    <div ref={ref} className="flex flex-wrap gap-2">
      {shown.map((tag) => (
        <span key={tag} className={cn(chip, "sensitive bg-white/[0.05] text-zinc-300")}>
          {tag}
        </span>
      ))}
      {!expanded && fit !== null && fit < tags.length && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={cn(chip, "font-medium text-zinc-400 ring-1 ring-white/15 transition-colors hover:text-white hover:ring-white/30")}
        >
          +{tags.length - fit} more
        </button>
      )}
      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className={cn(chip, "font-medium text-zinc-400 transition-colors hover:text-white")}
        >
          Show less
        </button>
      )}
    </div>
  );
}

function EditLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-2 block text-[13px] text-zinc-500">{children}</span>;
}

type TabId = "overview" | "bookmarks" | "gallery" | "note";

/**
 * Everything about the item under its title: its chapters as a row of
 * frames, then tabs — the overview (story, facts, tags, and every editor
 * while editing), your bookmarks, the stills beside it, and your note. One panel at a time,
 * rather than all of them stacked down the page.
 */
export function DetailsPanel({
  item,
  currentTime = null,
  editing,
  canEdit,
  onToggleEditing,
  categories,
  bookmarks,
  markers = [],
  onJumpToBookmark,
  kindPending,
  onChangeKind,
  reframing,
  setReframing,
  framingSaving,
  onSaveFraming,
}: {
  item: MediaItemDetail;
  /** Where playback is, while playing; null before. Lights the current chapter. */
  currentTime?: number | null;
  editing: boolean;
  /** Whether the Edit toggle is offered (the owner, not on a phone). */
  canEdit: boolean;
  onToggleEditing: () => void;
  categories: Category[];
  bookmarks: Bookmark[];
  /** The video's positions (chapters), from ThePornDB. */
  markers?: Marker[];
  onJumpToBookmark: (seconds: number) => void;
  kindPending: boolean;
  onChangeKind: (kind: string) => void;
  reframing: boolean;
  setReframing: (reframing: boolean) => void;
  framingSaving: boolean;
  onSaveFraming: (next: FramingValue) => void;
}) {
  const queryClient = useQueryClient();
  const galleryTotal = useGalleryTotal(item.id);
  const isVideo = item.itemType === "video";
  const [chosen, setTab] = useState<TabId>("overview");

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    ...(isVideo ? [{ id: "bookmarks" as const, label: "Bookmarks", count: bookmarks.length }] : []),
    // No count on the tab: the number of stills isn't worth the attention;
    // the tab appears only when there are some.
    ...(galleryTotal > 0 ? [{ id: "gallery" as const, label: "Gallery" }] : []),
    ...(item.itemType !== "folder" ? [{ id: "note" as const, label: "Note" }] : []),
  ];
  // Editing happens on the overview; a tab that has gone (the last chapter
  // removed, say) falls back to it too.
  const tab = editing || !tabs.some((t) => t.id === chosen) ? "overview" : chosen;

  const categoryLabel = categories.find((c) => c.slug === item.kind)?.label ?? item.kind;

  // Where the underline sits: under the chosen tab, re-measured when the tab
  // changes, a tab appears or goes, or the bar is resized.
  const tabListRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState({ left: 0, width: 0 });
  const tabIds = tabs.map((t) => t.id).join(",");
  useLayoutEffect(() => {
    const list = tabListRef.current;
    if (!list) return;
    const measure = () => {
      const active = list.querySelector<HTMLElement>(`[data-tab="${tab}"]`);
      if (active) setUnderline({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [tab, tabIds]);

  return (
    <section className="space-y-7">
      {item.playbackWarning && (
        <p className="rounded-xl bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
          {item.playbackWarning}
        </p>
      )}

      {/* Chapters stand on their own above the tabs: a row of frames you
          can see at a glance, not a list hidden behind a tab. */}
      {isVideo && markers.length > 0 && (
        <div className="pb-6">
          <ChapterFrames item={item} markers={markers} currentTime={currentTime} onJump={onJumpToBookmark} />
        </div>
      )}

      <div className="flex items-end justify-between gap-6 border-b border-white/[0.08]">
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="Details"
          className="scrollbar-hide relative -mb-px flex gap-7 overflow-x-auto"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-tab={t.id}
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 pb-3.5 text-[15px] transition-colors duration-200",
                tab === t.id ? "font-semibold text-white" : "font-medium text-zinc-400 hover:text-zinc-200",
              )}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className="ml-1.5 tabular-nums text-zinc-500">{t.count}</span>
              )}
            </button>
          ))}
          {/* One underline that glides to the chosen tab, rather than each
              tab drawing its own and the line jumping. */}
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-0 h-0.5 rounded-full bg-primary transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ left: underline.left, width: underline.width }}
          />
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onToggleEditing}
            aria-pressed={editing}
            className={cn(
              "mb-2 flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
              editing ? "bg-primary text-white" : "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
            )}
          >
            {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
            {editing ? "Done" : "Edit details"}
          </button>
        )}
      </div>

      <div role="tabpanel" className="min-h-24">
        {tab === "overview" && (
          <div className="space-y-10">
            {/* A compact strip: a small label over each value, hairlines
                between them, each only as wide as its content; the picture's
                size and quality right-aligned at the far end. */}
            <dl className="flex flex-wrap items-end gap-y-5">
              {isVideo && (
                <>
                  <StripFact label="Studio">
                    <StudioEditor
                      itemId={item.id}
                      studio={item.studio}
                      readOnly={!editing}
                      textClassName="hover:underline"
                    />
                  </StripFact>
                  {item.releaseDate && <StripFact label="Released">{formatDate(item.releaseDate)}</StripFact>}
                  <StripFact label="Category">
                    {editing ? (
                      <select
                        value={item.kind}
                        onChange={(e) => onChangeKind(e.target.value)}
                        disabled={kindPending}
                        className="rounded-lg bg-white/[0.06] px-2 py-0.5 text-sm font-medium outline-none focus:ring-1 focus:ring-primary/60 disabled:opacity-50"
                      >
                        {categories.map((category) => (
                          <option key={category.slug} value={category.slug}>
                            {category.label}
                          </option>
                        ))}
                        {/* An item can hold a slug whose category was deleted;
                            without this the select would show the first
                            option and misrepresent what's stored. */}
                        {!categories.some((c) => c.slug === item.kind) && (
                          <option value={item.kind}>{item.kind}</option>
                        )}
                      </select>
                    ) : (
                      categoryLabel
                    )}
                  </StripFact>
                  {item.watchedAt && <StripFact label="Finished">{formatDate(item.watchedAt)}</StripFact>}
                </>
              )}
              <StripFact label="Your rating" last>
                <StarRating itemId={item.id} rating={item.rating} />
              </StripFact>
              {isVideo && <QualityBadge item={item} />}
            </dl>

            {/* The story, and who's in it beside it. */}
            <div className="grid gap-x-16 gap-y-10 md:grid-cols-[minmax(0,1fr)_17rem] lg:grid-cols-[minmax(0,1fr)_19rem]">
              <div className="min-w-0 max-w-2xl">
                {editing ? (
                  <DescriptionEditor itemId={item.id} description={item.description} />
                ) : item.description ? (
                  <ClampedText
                    text={item.description}
                    className="sensitive text-[15px] leading-[1.75] text-zinc-300 md:text-base"
                  />
                ) : (
                  <p className="text-[15px] text-zinc-500">No description yet.</p>
                )}
                {!isVideo && (
                  <div className="mt-8">
                    <TechnicalInfoPanel item={item} />
                  </div>
                )}
              </div>

              {/* While editing, the performer editor below takes over. */}
              {isVideo && !editing && (
                <div className="min-w-0">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Starring</p>
                  <PerformerCards performers={item.performers} />
                </div>
              )}
            </div>

            {editing ? (
              <TagEditor key={item.id} itemId={item.id} tags={item.tags} readOnly={false} />
            ) : (
              <TagLine key={item.id} tags={item.tags.map((tag) => tag.name)} />
            )}

            {editing && (
              <div className="grid gap-x-12 gap-y-10 border-t border-white/[0.08] pt-8 md:grid-cols-2">
                <div className="md:col-span-2">
                  <EditLabel>Starring</EditLabel>
                  <PerformerEditor
                    itemId={item.id}
                    performers={item.performers}
                    source={item.performersSource}
                    readOnly={false}
                  />
                </div>

                <div className="md:col-span-2">
                  <EditLabel>Thumbnail</EditLabel>
                  <ThumbnailPicker
                    itemId={item.id}
                    hasCustom={item.thumbnailFile !== null}
                    onUploaded={() => setReframing(true)}
                  />
                  {reframing ? (
                    <FramingEditor
                      src={thumbnailUrl(item)}
                      value={{
                        x: item.thumbnailPositionX,
                        y: item.thumbnailPositionY,
                        scale: item.thumbnailScale,
                      }}
                      // A video's thumbnail is landscape: one 16:9 frame to
                      // drag and zoom, rather than a focal point checked
                      // against every tile shape and the hero banner.
                      aspectClass="aspect-video"
                      saving={framingSaving}
                      onSave={onSaveFraming}
                      onCancel={() => setReframing(false)}
                      note="Drag and zoom to choose what the thumbnail shows."
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReframing(true)}
                      className="mt-2 flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/[0.12]"
                    >
                      <Move className="size-3.5" />
                      Reposition
                    </button>
                  )}
                </div>

                <FolderPicker itemId={item.id} parentId={item.parentId} />
              </div>
            )}
          </div>
        )}

        {tab === "bookmarks" && (
          <div className="max-w-2xl">
            <BookmarkList itemId={item.id} bookmarks={bookmarks} onJump={onJumpToBookmark} />
          </div>
        )}

        {tab === "gallery" && <GalleryStrip itemId={item.id} bare />}

        {tab === "note" && (
          <div className="max-w-2xl">
            <NoteEditor
              note={item.note ?? null}
              onSave={async (note) => {
                await setItemNote(item.id, note);
                // The detail carries the note; lists are refreshed because
                // search reads notes too.
                await queryClient.invalidateQueries({ queryKey: qk.mediaItem.detail(item.id) });
                void queryClient.invalidateQueries({ queryKey: qk.mediaItems.all });
              }}
            />
          </div>
        )}
      </div>
    </section>
  );
}
