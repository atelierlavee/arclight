import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Film,
  LoaderCircle,
  RefreshCw,
  SkipForward,
  DatabaseZap,
  Copy,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageBody } from "@/components/PageBody";
import { PerformerEditor } from "@/components/PerformerEditor";
import { TagEditor } from "@/components/TagEditor";
import { thumbnailUrl, framingStyle } from "@/lib/mediaItemApi";
import { formatDuration } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";
import { useIsOwner } from "@/lib/profile";
import { useAppearance } from "@/lib/appearance";
import { fetchStashDbStatus } from "@/lib/stashdbApi";
import { fetchItem } from "@/lib/mediaItemApi";
import { FilenameDetailsDialog } from "@/components/FilenameDetailsDialog";
import { suggestedFilename } from "@/lib/suggestedFilename";
import { StashDbSceneDialog } from "@/components/StashDbSceneDialog";
import { ClampedText } from "@/components/ClampedText";
import { OwnerOnlyPage } from "@/components/OwnerOnly";
import { getRouteApi, useNavigate } from "@tanstack/react-router";

const inboxRouteApi = getRouteApi("/inbox");

type InboxPerformer = { id: number; name: string };
type InboxTag = { id: number; name: string };

type InboxItem = {
  id: number;
  title: string;
  description: string | null;
  thumbnailFile: string | null;
  thumbnailPositionX: number;
  thumbnailPositionY: number;
  thumbnailScale: number;
  durationSeconds: number | null;
  releaseDate: string | null;
  fileName: string | null;
  itemType: string;
  studioId: number | null;
  studioName: string | null;
  rating: number | null;
  isFavorite: boolean;
  performers: InboxPerformer[];
  tags: InboxTag[];
};

type InboxResponse = {
  items: InboxItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

async function triageItems(ids: number[]) {
  const res = await fetch("/api/inbox/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Failed to triage");
  return res.json();
}

async function triageAll() {
  const res = await fetch("/api/inbox/triage-all", { method: "POST" });
  if (!res.ok) throw new Error("Failed to triage all");
  return res.json();
}

function EmptyInbox() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <CheckCheck className="mb-2 size-9 text-muted-foreground" />
      <h2 className="text-xl font-semibold">All caught up</h2>
      <p className="text-sm text-muted-foreground">No items awaiting review.</p>
    </div>
  );
}

function InboxThumbnail({ item, compact = false }: { item: InboxItem; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [clipReady, setClipReady] = useState(false);
  const [clipFailed, setClipFailed] = useState(false);
  // Same rules as the detail sheet: no motion in discreet mode, or when the
  // "Play preview when opened" preference is off.
  const { discreet, modalPreview } = useAppearance();
  const autoplay = !compact && item.itemType === "video" && !discreet && modalPreview && !clipFailed;
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
      {failed ? (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          <Film className={compact ? "size-5" : "size-10"} aria-label="No preview available" />
        </div>
      ) : (
        <img
          src={thumbnailUrl(item)}
          alt={compact ? "" : item.title}
          className="size-full object-cover"
          style={framingStyle(item)}
          loading={compact ? "lazy" : "eager"}
          onError={() => setFailed(true)}
        />
      )}
      {autoplay && !failed && (
        <video
          src={`/api/media-items/${item.id}/preview`}
          autoPlay
          muted
          loop
          playsInline
          onPlaying={() => setClipReady(true)}
          onError={() => setClipFailed(true)}
          style={{ opacity: clipReady ? 1 : 0, transition: "opacity 300ms ease-out" }}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {!compact && item.durationSeconds != null && (
        <span className="absolute bottom-3 left-3 rounded-md bg-black/75 px-2 py-1 text-xs tabular-nums text-white backdrop-blur-sm">
          {formatDuration(item.durationSeconds)}
        </span>
      )}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      aria-hidden="true"
      className="rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground"
    >
      {children}
    </kbd>
  );
}

function Panel({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</h4>
        {hint}
      </div>
      {children}
    </section>
  );
}

/**
 * The name this file should have so the scanner reads its studio, cast, date
 * and title back: hover to see it, click to copy, then rename the file on the
 * drive. Built from what the item has now, so it improves as details are
 * synced from StashDB.
 */
function FilenameButton({ item }: { item: InboxItem }) {
  const [copied, setCopied] = useState(false);
  const [filling, setFilling] = useState(false);
  const suggestion = suggestedFilename({
    studio: item.studioName,
    performers: item.performers.map((p) => p.name),
    date: item.releaseDate,
    title: item.title,
    currentName: item.fileName,
  });

  async function copy() {
    // Not enough to name it yet: ask for what is missing instead of doing nothing.
    if (!suggestion) {
      setFilling(true);
      return;
    }
    try {
      await navigator.clipboard.writeText(suggestion);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* Clipboard blocked (e.g. a non-secure origin): nothing to fall back on. */
    }
  }

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={suggestion ? `Copy filename: ${suggestion}` : "Copy filename"}
        className="inline-flex size-11 items-center justify-center rounded-md border border-border hover:bg-accent"
      >
        {copied ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
      </button>
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 hidden w-max max-w-[min(32rem,85vw)] rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg group-focus-within:block group-hover:block"
      >
        {suggestion ? (
          <>
            <code className="block break-all text-sm">{suggestion}</code>
            <span className="mt-1 block text-muted-foreground">
              {copied
                ? "Copied"
                : suggestion === item.fileName
                  ? "Already the current name · click to copy"
                  : "Click to copy"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            Missing a studio{item.studioName ? " or title" : ""}. Click to fill in the details.
          </span>
        )}
      </div>
      {filling && (
        <FilenameDetailsDialog
          itemId={item.id}
          studio={item.studioName}
          title={item.title}
          releaseDate={item.releaseDate}
          performers={item.performers.map((p) => p.name)}
          fileName={item.fileName}
          onClose={() => setFilling(false)}
        />
      )}
    </div>
  );
}

/** The owner profile's page; anyone else is told so. */
export function InboxPage() {
  return useIsOwner() ? <InboxPageContent /> : <OwnerOnlyPage title="Inbox" />;
}

function InboxPageContent() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { item: wanted } = inboxRouteApi.useSearch();
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(1);
  const activeThumb = useRef<HTMLButtonElement | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: qk.inbox.page(page),
    queryFn: async () => {
      const res = await fetch(`/api/inbox?page=${page}`);
      if (!res.ok) throw new Error("Failed to load inbox");
      return res.json() as Promise<InboxResponse>;
    },
  });

  const { data: countData } = useQuery({
    queryKey: qk.inboxCount,
    queryFn: async () => {
      const res = await fetch("/api/inbox/count");
      if (!res.ok) throw new Error("Failed to load inbox count");
      return res.json() as Promise<{ count: number }>;
    },
  });

  const items = useMemo(() => data?.items ?? [], [data]);
  const total = items.length;

  // The URL names the video being reviewed. When it is on this page it is
  // the selection; when it isn't, the server says which page it is on.
  const wantedIndex = wanted === undefined ? -1 : items.findIndex((entry) => entry.id === wanted);
  const located = useQuery({
    queryKey: qk.inbox.locate(wanted ?? 0),
    queryFn: async () => {
      const res = await fetch(`/api/inbox/locate?id=${wanted}`);
      if (!res.ok) throw new Error("Not waiting in the inbox");
      return res.json() as Promise<{ page: number }>;
    },
    enabled: wanted !== undefined && data !== undefined && wantedIndex === -1,
    retry: false,
  });
  // Moved to that page once per video asked for — during render, not in an
  // effect, so the wrong page never paints first.
  const [jumpedFor, setJumpedFor] = useState<number | null>(null);
  if (located.data && located.data.page !== page && jumpedFor !== wanted) {
    setJumpedFor(wanted ?? null);
    setPage(located.data.page);
  }
  const current = wantedIndex >= 0 ? wantedIndex : index;
  const item = items[current] ?? null;

  /** Moves the selection, and the URL with it. */
  const select = useCallback(
    (next: number) => {
      setIndex(next);
      const target = items[next];
      if (target) void navigate({ to: "/inbox", search: { item: target.id }, replace: true });
    },
    [items, navigate],
  );

  // Still finding the page of a video the URL asked for: leave the URL be.
  // Once it is found — or turns out not to be waiting any more — whatever is
  // selected is written back, so the URL always names what is on screen.
  const settling =
    wanted !== undefined &&
    wantedIndex === -1 &&
    !located.isError &&
    !(located.data && located.data.page === page && data !== undefined);
  useEffect(() => {
    if (!item || settling || item.id === wanted) return;
    void navigate({ to: "/inbox", search: { item: item.id }, replace: true });
  }, [item, settling, wanted, navigate]);

  const triageMutation = useMutation({
    mutationFn: (ids: number[]) => triageItems(ids),
    onSuccess: (_result, ids) => {
      queryClient.setQueryData<InboxResponse>(qk.inbox.page(page), (current) =>
        current ? { ...current, items: current.items.filter((entry) => !ids.includes(entry.id)) } : current,
      );
      queryClient.invalidateQueries({ queryKey: qk.inbox.all });
      queryClient.invalidateQueries({ queryKey: qk.inboxCount });
    },
  });

  const triageAllMutation = useMutation({
    mutationFn: triageAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.inbox.all });
      queryClient.invalidateQueries({ queryKey: qk.inboxCount });
      setIndex(0);
      setPage(1);
      void navigate({ to: "/inbox", search: {}, replace: true });
    },
  });

  // Only asked once the page is up; the button appears when a key is set.
  const { data: stashDb } = useQuery({ queryKey: qk.stashDbStatus, queryFn: fetchStashDbStatus });

  const [lookingUp, setLookingUp] = useState(false);

  const goNext = useCallback(() => {
    if (current < total - 1) select(current + 1);
  }, [current, total, select]);

  const goPrev = useCallback(() => {
    if (current > 0) select(current - 1);
  }, [current, select]);

  const markDone = useCallback(() => {
    if (!item || triageMutation.isPending || triageAllMutation.isPending) return;
    triageMutation.mutate([item.id]);
  }, [item, triageMutation, triageAllMutation.isPending]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof Element &&
          e.target.closest("input, textarea, select, button, a, [contenteditable], [role='dialog']"))
      )
        return;

      switch (e.key) {
        case "ArrowRight":
        case "j":
          e.preventDefault();
          goNext();
          break;
        case "ArrowLeft":
        case "k":
          e.preventDefault();
          goPrev();
          break;
        case "s":
          e.preventDefault();
          goNext();
          break;
        case "Enter":
          e.preventDefault();
          markDone();
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, markDone]);

  useEffect(() => {
    if (index >= total && total > 0) setIndex(total - 1);
    if (wantedIndex >= 0 && wantedIndex !== index) setIndex(wantedIndex);
    if (data && total === 0 && page > 1) {
      setPage((current) => current - 1);
      setIndex(0);
    }
  }, [total, index, data, page, wantedIndex]);

  // Keep the selected frame in view as you move through the strip.
  useEffect(() => {
    activeThumb.current?.scrollIntoView?.({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [current, item?.id]);

  const busy = triageMutation.isPending || triageAllMutation.isPending;
  const actionError = triageMutation.error ?? triageAllMutation.error;
  const changePage = (next: number) => {
    setPage(next);
    setIndex(0);
    // The new page's first video takes over the URL once it loads.
    void navigate({ to: "/inbox", search: {}, replace: true });
  };
  const remaining = countData?.count ?? total;
  const progress = total > 0 ? ((current + 1) / total) * 100 : 0;

  return (
    <AppShell
      title="Inbox"
      // Centred, title and all: a single item being reviewed reads best in
      // the middle of a wide screen, not against its left edge.
      centeredHeader
      subtitle={
        isLoading || isError
          ? "Tag each new item, then mark it done."
          : `${remaining} awaiting review · Tag each new item, then mark it done.`
      }
      actions={
        <>
          {total > 0 && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Mark all ${remaining} inbox items as reviewed?`))
                  triageAllMutation.mutate();
              }}
              disabled={busy}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck className="size-4" />
              Mark all done
            </button>
          )}
        </>
      }
    >
      <PageBody width="wide" className="mx-auto">
        {isLoading && (
          <div role="status" aria-label="Loading inbox" className="space-y-4">
            <div className="aspect-video w-full animate-pulse rounded-lg bg-muted" />
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((entry) => (
                <div key={entry} className="h-16 w-28 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          </div>
        )}

        {isError && (
          <div role="alert" className="flex flex-col items-center gap-4 py-20 text-center">
            <AlertCircle className="size-8 text-muted-foreground" />
            <p>Could not load the inbox.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm"
            >
              <RefreshCw className="size-4" />
              Retry
            </button>
          </div>
        )}

        {actionError && (
          <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            {actionError.message}. Please try again.
          </p>
        )}

        {!isLoading && !isError && total === 0 && <EmptyInbox />}

        {!isLoading && item && (
          <div className="min-w-0 space-y-5">
            <div
              className="h-1 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Position in queue"
              aria-valuemin={1}
              aria-valuemax={total}
              aria-valuenow={current + 1}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <section className="min-w-0" aria-label="Selected item">
              <div className="relative">
                <InboxThumbnail key={`${item.id}-${item.thumbnailFile}`} item={item} />
                <span className="absolute right-3 top-3 rounded-md bg-black/75 px-2 py-1 text-xs tabular-nums text-white backdrop-blur-sm">
                  {current + 1} / {total}
                </span>
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={current === 0 || busy}
                  aria-label="Previous item"
                  title="Previous item (←)"
                  className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-opacity hover:bg-black/80 disabled:opacity-0"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={current >= total - 1 || busy}
                  aria-label="Next item"
                  title="Next item (→)"
                  className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-opacity hover:bg-black/80 disabled:opacity-0"
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>

              <div className="mt-4">
                <h3 className="break-words text-2xl font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">
                  {item.title}
                </h3>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {item.studioName && <span className="break-words">{item.studioName}</span>}
                  {item.releaseDate && <time dateTime={item.releaseDate}>{item.releaseDate}</time>}
                </div>
                {item.description && (
                  <ClampedText
                    text={item.description}
                    className="mt-3 text-sm leading-relaxed text-muted-foreground"
                  />
                )}
              </div>

              <div key={item.id} className="mt-5 grid min-w-0 gap-4 md:grid-cols-2">
                <Panel label="Performers">
                  <PerformerEditor itemId={item.id} performers={item.performers} source="user" />
                </Panel>
                <Panel label="Tags">
                  <TagEditor itemId={item.id} tags={item.tags.map((t) => ({ ...t, color: null }))} />
                </Panel>
              </div>
            </section>

            <div className="sticky bottom-0 -mx-4 border-t border-border bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  aria-label="Skip for now"
                  onClick={goNext}
                  disabled={current >= total - 1 || busy}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                >
                  <SkipForward className="size-4" />
                  Skip for now <Kbd>S</Kbd>
                </button>
                <div className="flex items-center gap-2">
                  {stashDb?.configured && item.itemType === "video" && (
                    <button
                      type="button"
                      onClick={() => setLookingUp(true)}
                      disabled={busy}
                      title="Look up on StashDB"
                      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-sm hover:bg-accent disabled:opacity-50"
                    >
                      <DatabaseZap className="size-4" />
                      Sync details
                    </button>
                  )}
                  {item.itemType === "video" && <FilenameButton item={item} />}
                  <button
                    type="button"
                    aria-label="Mark done"
                    onClick={markDone}
                    disabled={busy}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {triageMutation.isPending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Mark done <Kbd>↵</Kbd>
                  </button>
                </div>
              </div>
            </div>

            <aside className="min-w-0" aria-label="Review queue">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Up next</h3>
                {(page > 1 || data?.hasMore) && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Previous queue page"
                      title="Previous queue page"
                      disabled={page === 1 || busy}
                      onClick={() => changePage(page - 1)}
                      className="flex size-8 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <span className="text-xs tabular-nums text-muted-foreground">Page {page}</span>
                    <button
                      type="button"
                      aria-label="Next queue page"
                      title="Next queue page"
                      disabled={!data?.hasMore || busy}
                      onClick={() => changePage(page + 1)}
                      className="flex size-8 items-center justify-center rounded-md hover:bg-accent disabled:opacity-30"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {items.map((entry, entryIndex) => {
                  const current = entry.id === item.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      ref={current ? activeThumb : undefined}
                      onClick={() => select(entryIndex)}
                      disabled={busy}
                      title={entry.title}
                      aria-label={`Review ${entry.title}`}
                      aria-current={current ? "true" : undefined}
                      className={`w-32 shrink-0 rounded-md p-1 transition disabled:opacity-50 ${current ? "bg-accent ring-2 ring-primary" : "opacity-70 hover:bg-muted hover:opacity-100"}`}
                    >
                      <InboxThumbnail key={`${entry.id}-${entry.thumbnailFile}`} item={entry} compact />
                    </button>
                  );
                })}
              </div>
            </aside>
          </div>
        )}
      </PageBody>
      {lookingUp && item && (
        <InboxStashDbDialog
          id={item.id}
          onClose={() => {
            setLookingUp(false);
            // The queue row and panels read the inbox list, not the item.
            void queryClient.invalidateQueries({ queryKey: qk.inbox.all });
          }}
        />
      )}
    </AppShell>
  );
}

/** The detail sheet's StashDB lookup, which wants the full item rather than a queue row. */
function InboxStashDbDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data } = useQuery({ queryKey: qk.mediaItem.detail(id), queryFn: () => fetchItem(id) });
  return data ? <StashDbSceneDialog item={data} onClose={onClose} /> : null;
}
