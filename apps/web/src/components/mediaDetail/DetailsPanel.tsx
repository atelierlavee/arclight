import { Check, CircleCheck, Droplets, Move, Pencil } from "lucide-react";
import { PerformerEditor } from "../PerformerEditor";
import { ClampedText } from "../ClampedText";
import { DescriptionEditor } from "../DescriptionEditor";
import { EditableTitle } from "../EditableTitle";
import { FolderPicker } from "../FolderPicker";
import { StudioEditor } from "../StudioEditor";
import { TagEditor } from "../TagEditor";
import { TechnicalInfoPanel } from "../TechnicalInfoPanel";
import { ThumbnailPicker } from "../ThumbnailPicker";
import { FramingEditor, type FramingValue } from "../FramingEditor";
import { StarRating } from "../StarRating";
import { BookmarkList } from "../BookmarkList";
import { SeriesAssignment } from "../SeriesAssignment";
import { NoteEditor } from "../NoteEditor";
import { formatTimestamp, type Bookmark } from "@/lib/bookmarkApi";
import type { Marker } from "@/lib/markerApi";
import type { Category } from "@/lib/categoryApi";
import { setItemNote, thumbnailUrl, type MediaItemDetail } from "@/lib/mediaItemApi";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/queryKeys";
import { cardChrome, TILE_SHAPES } from "@/lib/layout";
import { useAppearance } from "@/lib/appearance";
import { cn, formatDuration } from "@/lib/utils";
import { useIsOwner } from "@/lib/profile";

/**
 * The hero banner's shape, so reframing can preview it alongside the tiles.
 *
 * Derived from the viewport rather than a constant: the hero spans the full
 * width and a chosen fraction of the viewport height, so its ratio is a
 * property of the window and the setting, not of the card system. Falls back
 * to a typical wide banner when there is no window to measure, which keeps
 * this usable under test.
 */
function heroAspect(heroHeightPercent: number): string {
  if (typeof window === "undefined") return "16 / 5";
  const height = (window.innerHeight * heroHeightPercent) / 100;
  return height > 0 && window.innerWidth > 0
    ? `${window.innerWidth} / ${height}`
    : "16 / 5";
}

function FieldLabel({ children }: { children: React.ReactNode; accent?: string | null }) {
  return (
    <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-primary">{children}</span>
  );
}

/**
 * The video's positions, its chapters, as a quiet wrap of chips — start
 * time and name — where a click jumps the video there.
 */
function Positions({
  markers,
  duration,
  onJump,
}: {
  markers: Marker[];
  duration: number;
  onJump: (seconds: number) => void;
}) {
  const sorted = [...markers].sort((a, b) => a.startSeconds - b.startSeconds);
  // Where each ends: its own end, else where the next begins, else the end.
  const spans = sorted.map((marker, index) => {
    const end = marker.endSeconds ?? sorted[index + 1]?.startSeconds ?? duration;
    return { marker, start: marker.startSeconds, end: Math.max(end, marker.startSeconds) };
  });
  return (
    <div className="space-y-3">
      <FieldLabel>Positions · {markers.length}</FieldLabel>
      {/* One chip per position: when it starts, and its name. */}
      <div className="flex flex-wrap gap-2">
        {spans.map(({ marker, start }) => (
          <button
            key={marker.id}
            type="button"
            onClick={() => onJump(start)}
            title={`Jump to ${marker.title}`}
            className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs ring-1 ring-white/10 transition-colors hover:bg-white/[0.1] hover:ring-primary/60"
          >
            <span className="font-mono tabular-nums text-muted-foreground">{formatTimestamp(start)}</span>
            <span className="font-medium">{marker.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The record of the item below the player: its metadata, and the editors for it. */
export function DetailsPanel({
  item,
  isMobile,
  editing,
  onToggleEditing,
  accent,
  categories,
  bookmarks,
  markers = [],
  onJumpToBookmark,
  kindPending,
  onChangeKind,
  organisedPending,
  onToggleOrganised,
  onCountO,
  reframing,
  setReframing,
  framingSaving,
  onSaveFraming,
}: {
  item: MediaItemDetail;
  isMobile: boolean;
  editing: boolean;
  onToggleEditing: () => void;
  accent: string | null;
  categories: Category[];
  bookmarks: Bookmark[];
  /** The video's positions (chapters), from ThePornDB. */
  markers?: Marker[];
  onJumpToBookmark: (seconds: number) => void;
  kindPending: boolean;
  onChangeKind: (kind: string) => void;
  organisedPending: boolean;
  onToggleOrganised: (next: boolean) => void;
  onCountO: () => void;
  reframing: boolean;
  setReframing: (reframing: boolean) => void;
  framingSaving: boolean;
  onSaveFraming: (next: FramingValue) => void;
}) {
  const { density, heroHeight } = useAppearance();
  const isOwner = useIsOwner();
  const queryClient = useQueryClient();
  const released = item.releaseDate?.slice(0, 4) ?? null;
  return (
    <div className="grid gap-10 px-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-16 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0 space-y-6">
        {/* The title, then one quiet line of facts and the controls. */}
        <div className="space-y-3">
          {editing ? (
            <EditableTitle
              itemId={item.id}
              title={item.title}
              className="cursor-text text-3xl font-black tracking-tight hover:underline md:text-4xl"
            />
          ) : (
            <h2 className="sensitive text-3xl font-black leading-tight tracking-tight md:text-4xl">{item.title}</h2>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-xs uppercase tracking-[0.25em] text-white/60">
              {[released, formatDuration(item.durationSeconds)].filter(Boolean).join("  ·  ")}
            </span>
            <StarRating itemId={item.id} rating={item.rating} />
            {item.itemType === "video" && (
              <button
                type="button"
                onClick={onCountO}
                aria-label={`Count one (${item.oCount} so far)`}
                title="Count one"
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              >
                <Droplets className="size-3.5" />
                <span className="tabular-nums">{item.oCount}</span>
              </button>
            )}
            {/* A judgement about the metadata, so the owner's to make. */}
            {item.itemType === "video" && isOwner && (
              <button
                type="button"
                onClick={() => onToggleOrganised(item.organisedAt === null)}
                disabled={organisedPending}
                aria-pressed={item.organisedAt !== null}
                title={item.organisedAt === null ? "Mark organised" : "Mark not organised"}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors disabled:opacity-50",
                  item.organisedAt !== null
                    ? "text-primary"
                    : "text-muted-foreground hover:bg-white/10 hover:text-foreground",
                )}
              >
                <CircleCheck className="size-3.5" />
                Organised
              </button>
            )}
            {/* Nothing to toggle on a phone — the sheet is read-only there. */}
            {!isMobile && isOwner && (
              <button
                type="button"
                onClick={onToggleEditing}
                aria-pressed={editing}
                aria-label={editing ? "Finish editing details" : "Edit details"}
                title={editing ? "Done editing" : "Edit details"}
                className={cn(
                  "ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  editing
                    ? "bg-primary text-white"
                    : "text-muted-foreground ring-1 ring-white/15 hover:text-foreground hover:ring-white/30",
                )}
              >
                {editing ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
                {editing ? "Done" : "Edit"}
              </button>
            )}
          </div>
        </div>

        {editing ? (
          <DescriptionEditor itemId={item.id} description={item.description} />
        ) : (
          item.description && (
            <ClampedText
              text={item.description}
              className="sensitive max-w-3xl text-base leading-relaxed text-white/70"
            />
          )
        )}

        {/* Who's in it shows over the video while it plays; here only to edit. */}
        {editing && (
          <div className="space-y-3">
            <FieldLabel accent={accent}>Starring</FieldLabel>
            <PerformerEditor
              itemId={item.id}
              performers={item.performers}
              source={item.performersSource}
              readOnly={false}
            />
          </div>
        )}

        {item.itemType === "video" && markers.length > 0 && (
          <Positions
            markers={markers}
            duration={item.durationSeconds ?? 0}
            onJump={onJumpToBookmark}
          />
        )}

        {item.itemType === "video" && (
          <div className="space-y-3">
            <FieldLabel accent={accent}>
              Bookmarks{bookmarks.length > 0 && ` · ${bookmarks.length}`}
            </FieldLabel>
            <BookmarkList itemId={item.id} bookmarks={bookmarks} onJump={onJumpToBookmark} />
          </div>
        )}

        {item.itemType !== "folder" && (
          <div className="space-y-3">
            <FieldLabel accent={accent}>Note</FieldLabel>
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

        {item.playbackWarning && (
          <p className="rounded-md bg-yellow-500/15 px-3 py-2 text-sm text-yellow-500">
            {item.playbackWarning}
          </p>
        )}
      </div>

      {/* The facts: a column of labelled pieces, quiet beside the story. */}
      <div className="min-w-0 space-y-6 lg:border-l lg:border-white/10 lg:pl-10">
        <div className="space-y-2">
          <FieldLabel accent={accent}>Category</FieldLabel>
          {editing ? (
            <select
              value={item.kind}
              onChange={(e) => onChangeKind(e.target.value)}
              disabled={kindPending}
              className="w-full rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-sm outline-none focus:border-ring/60 disabled:opacity-50"
            >
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.label}
                </option>
              ))}
              {/* An item can hold a slug whose category was deleted;
                without this the select would silently show the first
                option and misrepresent what's stored. */}
              {!categories.some((c) => c.slug === item.kind) && (
                <option value={item.kind}>{item.kind}</option>
              )}
            </select>
          ) : (
            <span className="text-base font-semibold text-white">
              {categories.find((c) => c.slug === item.kind)?.label ??
                item.kind}
            </span>
          )}
        </div>

        {editing && (
          <div className="space-y-2">
            <FieldLabel accent={accent}>Thumbnail</FieldLabel>
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
                aspectClass="aspect-video"
                // Every shape this one value has to satisfy, rather
                // than the one tile shape that happens to be selected.
                // Previewing a single frame was what made the other
                // shapes unreachable: whichever axis that frame does
                // not crop cannot be dragged, so the hero's vertical
                // framing could never be set from either tile.
                //
                // Ratios come from cardChrome rather than written out
                // as classes, so tuning the portrait shape moves these
                // previews with it.
                previews={[
                  ...TILE_SHAPES.map((shape) => ({
                    label: shape.label,
                    aspectRatio: cardChrome(density, "none", shape.value)
                      .aspectRatio,
                  })),
                  { label: "Hero", aspectRatio: heroAspect(heroHeight) },
                ]}
                saving={framingSaving}
                onSave={onSaveFraming}
                onCancel={() => setReframing(false)}
                note="Used everywhere this image appears — tile, hover card, search row and the hero banner."
              />
            ) : (
              <button
                type="button"
                onClick={() => setReframing(true)}
                className="flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                <Move className="size-3.5" />
                Reposition
              </button>
            )}
          </div>
        )}

        <div className="space-y-2">
          <FieldLabel accent={accent}>Studio</FieldLabel>
          <StudioEditor
            itemId={item.id}
            studio={item.studio}
            readOnly={!editing}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel accent={accent}>Tags</FieldLabel>
          <TagEditor
            itemId={item.id}
            tags={item.tags}
            readOnly={!editing}
          />
        </div>

        <div className="space-y-2">
          <FieldLabel accent={accent}>Details</FieldLabel>
          <TechnicalInfoPanel item={item} />
        </div>

        {editing && (
          <FolderPicker itemId={item.id} parentId={item.parentId} />
        )}
        {editing && item.itemType === "video" && <SeriesAssignment item={item} />}
      </div>
    </div>
  );
}
