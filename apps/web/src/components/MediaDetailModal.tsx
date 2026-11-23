// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/lib/useMediaQuery";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, X } from "lucide-react";
import { AmbientLight } from "./AmbientLight";
import { GalleryStrip } from "./GalleryStrip";
import { Portal } from "./Portal";
import { RelatedItems } from "./RelatedItems";
import { useAppearance } from "@/lib/appearance";
import { fetchItem } from "@/lib/mediaItemApi";
import { bestPartSeconds } from "@/lib/heatmap";
import { cn } from "@/lib/utils";
import { QueuePanel } from "./QueuePanel";
import { SeekStrip } from "./SeekStrip";
import { PlayerGestures } from "./PlayerGestures";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { XRayPanel } from "./mediaDetail/XRayPanel";
import { DetailsPanel } from "./mediaDetail/DetailsPanel";
import { MiniPlayerHandles } from "./mediaDetail/MiniPlayerHandles";
import { PlayerControls } from "./mediaDetail/PlayerControls";
import { PlayerMedia } from "./mediaDetail/PlayerMedia";
import { MobilePlayButton, PreviewOverlay } from "./mediaDetail/PreviewOverlay";
import { UpNextCard } from "./mediaDetail/UpNextCard";
import { MIN_RESUMABLE_SECONDS } from "./mediaDetail/playerUtils";
import { useCastStream } from "./mediaDetail/useCastStream";
import { useToggleWatchLater } from "@/lib/watchLater";
import { ContactSheet } from "./ContactSheet";
import { useLeanBackDriver, useLeanBackStart } from "./mediaDetail/useLeanBack";
import { LeanBackBar } from "./mediaDetail/LeanBackBar";
import { endLeanBack } from "@/lib/leanBack";
import { useItemActions } from "./mediaDetail/useItemActions";
import { useMiniPlayerFrame } from "./mediaDetail/useMiniPlayerFrame";
import { usePlaybackProgress } from "./mediaDetail/usePlaybackProgress";
import { useSubtitles, useSubtitleTracks } from "./mediaDetail/useSubtitles";
import { usePlayerControlsVisibility } from "./mediaDetail/usePlayerControlsVisibility";
import { usePlayerData } from "./mediaDetail/usePlayerData";
import { usePlayerKeyboard } from "./mediaDetail/usePlayerKeyboard";
import { useQueueAdvance } from "./mediaDetail/useQueueAdvance";
import { useScreenModes } from "./mediaDetail/useScreenModes";
import { useVideoPlayback, type PlayerMode } from "./mediaDetail/useVideoPlayback";
import { qk } from "@/lib/queryKeys";
import { useIsOwner } from "@/lib/profile";
import { adjacentPositionStart } from "@/lib/markerApi";

/**
 * A section of the watch page under the video: a short pink rule and its
 * name in spaced capitals, then the content — the home page's chapter
 * labels. `show` false renders the content alone, as it always was.
 */
function ModalSection({ label, show, children }: { label: string; show: boolean; children: React.ReactNode }) {
  if (!show) return <>{children}</>;
  return (
    <section className="mt-12 space-y-4 first-of-type:mt-8">
      <h2 className="flex items-center gap-3 px-4 text-xs font-semibold uppercase tracking-[0.3em] text-primary md:px-6">
        <span className="h-px w-8 bg-primary/60" />
        {label}
      </h2>
      {children}
    </section>
  );
}

export function MediaDetailModal({
  itemId,
  autoPlay = false,
  resume = false,
  onClose,
  mini = false,
  onExpand,
}: {
  itemId: number;
  autoPlay?: boolean;
  resume?: boolean;
  onClose: () => void;
  mini?: boolean;
  onExpand?: () => void;
}) {
  // Clicking a "More Like This" card swaps the modal's content in place
  // rather than stacking modals or bouncing back to the grid.
  const [viewingId, setViewingId] = useState(itemId);
  const panelRef = useRef<HTMLDivElement>(null);

  // Without this, focus stays on the page behind: Tab walks the background
  // instead of the dialog, and closing leaves focus nowhere useful.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);
  // The mini player floats over a page you are still using, so it is not
  // modal and must not hold focus; the full sheet is, and must.
  useFocusTrap(panelRef, !mini);

  const { data: item } = useQuery({
    queryKey: qk.mediaItem.detail(viewingId),
    queryFn: () => fetchItem(viewingId),
  });

  const {
    discreet,
    modalPreview,
    autoplayNext,
    ambientLight: ambient,
    hallOfFamePin,
    set: setAppearance,
  } = useAppearance();
  // The player's own button flips the same Appearance setting.
  const toggleAmbient = () => setAppearance({ ambientLight: !ambient });
  const [mode, setMode] = useState<PlayerMode>("preview");

  // Opened, but holding the still with nothing running. Only ever true before
  // real playback starts: once you press Play the mode changes and neither
  // discreet mode nor the preview preference gets a say in it.
  const stillOnly = mode === "preview" && (discreet || !modalPreview);
  const isMobile = useIsMobile();
  const [reframing, setReframing] = useState(false);
  // Metadata is read-only until you ask to edit it. Showing every editor by
  // default filled the panel with empty "Add tag…" style inputs, which read
  // as unfinished rather than as a record of the video.
  const [editingRequested, setEditing] = useState(false);
  // Read-only on a phone. Derived rather than just hiding the button, so a
  // sheet left in edit mode on a desktop cannot stay that way when the window
  // narrows — every editor below is gated on this one flag.
  // Metadata is the owner profile's to change.
  const isOwner = useIsOwner();
  const editing = editingRequested && !isMobile && isOwner;
  const isVideo = item?.itemType === "video";

  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const playerAreaRef = useRef<HTMLDivElement>(null);

  const { bookmarks, markers, scrubSprite, heatmapBuckets, categories, accent, addBookmark } =
    usePlayerData({ viewingId, item, mode, mini, videoRef });
  const { updateKind, toggleFavorite, saveFraming, toggleWatched, toggleOrganised, countO } =
    useItemActions({
      viewingId,
      title: item?.title,
      onFramingSaved: () => setReframing(false),
    });

  const toggleWatchLater = useToggleWatchLater();
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const leanBack = useLeanBackStart();
  // Closing the player is how a lean-back session ends.
  useEffect(() => () => endLeanBack(), []);

  const { showPlayerControls, revealPlayerControls, scheduleHideControls } =
    usePlayerControlsVisibility(mode);
  const playback = useVideoPlayback({
    videoRef,
    item,
    mode,
    setMode,
    revealPlayerControls,
    autoPlay,
    resume,
    itemId,
    resolveStart: leanBack.resolveStart,
  });
  const { skipSeconds, startPosition, seekTo, startPlaying } = playback;
  const subtitleTracks = useSubtitleTracks(viewingId, isVideo && mode === "playing");
  const subtitles = useSubtitles({ videoRef, tracks: subtitleTracks, mode, videoId: viewingId });
  const progress = usePlaybackProgress({
    videoRef,
    item,
    mode,
    setCurrentTime: playback.setCurrentTime,
  });
  const screenModes = useScreenModes({ videoRef, playerAreaRef, isMobile, mini });
  const { cinema, setCinema } = screenModes;
  const { cast, castSrc, setCastSrc, startCasting } = useCastStream({
    videoRef,
    item,
    viewingId,
    mode,
    setStartPosition: (seconds) => {
      startPosition.current = seconds;
    },
  });
  const { miniPosition, miniWidth, dragHandlers, resizeHandlers } =
    useMiniPlayerFrame(mini, revealPlayerControls);

  /** From the bookmark list: seek if already playing, otherwise start there. */
  function jumpTo(seconds: number) {
    if (mode === "playing") {
      seekTo(seconds);
      void videoRef.current?.play().catch(() => {});
    } else {
      startPlaying(seconds);
    }
  }

  const bestPart = bestPartSeconds(
    heatmapBuckets,
    item?.durationSeconds ?? videoRef.current?.duration ?? 0,
  );

  function jumpToBestPart() {
    if (bestPart === null) return;
    seekTo(bestPart);
    void videoRef.current?.play().catch(() => {});
  }

  /** `[` and `]`: the previous or next named position, like chapters. */
  function jumpToPosition(direction: 1 | -1) {
    const video = videoRef.current;
    if (!video) return;
    const target = adjacentPositionStart(markers, video.currentTime, direction);
    if (target === undefined) return;
    seekTo(target);
    // So the stretches, and which one you landed on, are there to see.
    revealPlayerControls();
  }

  /**
   * Shows another item in this same modal, from a clean slate.
   *
   * Everything per-item goes back to how a fresh open would have it — the
   * muted preview, no seek, no cast stream — rather than inheriting the
   * previous item's playing state. Shared by "More Like This", the queue,
   * and a new play request arriving while the modal is already open.
   */
  function showItem(id: number) {
    setViewingId(id);
    setMode("preview");
    setEditing(false);
    playback.setMuted(true);
    setReframing(false);
    setContactSheetOpen(false);
    playback.setSeeked(false);
    playback.setCurrentTime(0);
    setCastSrc(null);
    playback.setShowRates(false);
    playback.setShowSkipOptions(false);
    startPosition.current = 0;
    progress.lastSavedAt.current = 0;
    playback.autoPlayTriggered.current = false;
    scrollRef.current?.scrollTo({ top: 0 });
  }

  // A new play request while open (the mini player is up and something else
  // is picked) arrives as a new itemId. Reset exactly as "More Like This"
  // does, so the autoplay effect fires again — with this request's resume
  // flag — instead of seeing it already triggered for the previous item.
  const shownRequest = useRef(itemId);
  useEffect(() => {
    if (shownRequest.current === itemId) return;
    shownRequest.current = itemId;
    showItem(itemId);
    // showItem is rebuilt every render; only a new request should run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  // Called after the effects above so they keep running in the same order:
  // the queue's own auto-advance effect comes last.
  const queue = useQueueAdvance({
    item,
    viewingId,
    mode,
    mini,
    cinema,
    currentTime: playback.currentTime,
    // A lean-back session always moves on, whatever the setting says.
    autoplayNext: autoplayNext || leanBack.session !== null,
    markWatched: () => toggleWatched.mutate(true),
    showItem,
    startPlaying: (position) =>
      startPlaying(item ? leanBack.resolveStart(item, position) : position),
  });
  const { queueBeside, nextQueuedItem } = queue;
  // The watch page, styled like the home page's opening shot: the video
  // full-bleed at the top, then labelled sections below. Everything but the
  // mini player and cinema.
  const page = !mini && !cinema;
  // The queue no longer floats over the video: on the page it has a section.
  const queueOverVideo = queueBeside && !page;
  const leanBackDriver = useLeanBackDriver({
    session: leanBack.session,
    clipEnd: leanBack.clipEnd,
    item,
    mode,
    mini,
    cinema,
    setCinema,
    currentTime: playback.currentTime,
    nextQueuedId: nextQueuedItem?.id,
    playNextQueued: queue.playNextQueued,
    videoRef,
  });

  usePlayerKeyboard({
    ...playback,
    ...screenModes,
    videoRef,
    mode,
    mini,
    isVideo,
    queueOpen: queue.queueOpen,
    setQueueChoice: queue.setQueueChoice,
    onClose,
    addBookmark,
    countO,
    cycleSubtitles: subtitles.cycle,
    jumpToBestPart,
    jumpToPosition,
    toggleContactSheet: () => setContactSheetOpen((open) => !open),
  });

  const canResume =
    !!item &&
    item.lastPositionSeconds > MIN_RESUMABLE_SECONDS &&
    (item.durationSeconds == null ||
      item.lastPositionSeconds < item.durationSeconds - MIN_RESUMABLE_SECONDS);

  return (
    <Portal lockPageScroll={!mini}>
      <div
        ref={scrollRef}
        // overscroll-contain stops the scroll continuing into the page
        // behind once this container hits its end.
        className={cn(
          "z-50",
          mini
            ? "pointer-events-none fixed inset-0 overflow-visible bg-transparent"
            : "fixed inset-0 overflow-y-auto overscroll-contain bg-background",
        )}
        onClick={onClose}
      >
        {/* Behind the dialog, on the dimmed backdrop. Not in cinema mode,
            where the video already fills the screen; not in the mini player,
            which has no backdrop; and not in discreet mode, where colour
            moving across the room gives away what's playing. */}
        <AmbientLight
          videoRef={videoRef}
          active={ambient && isVideo && mode === "playing" && !mini && !cinema && !discreet}
        />
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal={mini ? "false" : "true"}
          // A label rather than aria-labelledby: which heading is on screen
          // depends on the layout (overlay, info column, the title editor,
          // none at all in the mini player), but the item's title is the
          // dialog's name in every one of them.
          aria-label={item?.title ?? "Media details"}
          className={cn(
            "relative overflow-hidden bg-card shadow-2xl focus:outline-none",
            mini
              ? "pointer-events-auto fixed z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg ring-1 ring-border"
              : cinema
                ? "fixed inset-0 z-50 bg-black"
                : "min-h-full w-full animate-fade-in bg-background pb-24",
          )}
          style={
            mini
              ? {
                  left: miniPosition.left,
                  top: miniPosition.top,
                  width: miniWidth,
                }
              : undefined
          }
          onMouseEnter={mini ? revealPlayerControls : undefined}
          onMouseMove={mini ? revealPlayerControls : undefined}
          onMouseLeave={mini ? scheduleHideControls : undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {mini && (
            <MiniPlayerHandles
              showDragHandle={!!item}
              visible={showPlayerControls}
              dragHandlers={dragHandlers}
              resizeHandlers={resizeHandlers}
            />
          )}
          {/* The player and the queue share a row. The player keeps its
              aspect ratio and so decides the row's height; the queue column
              stretches to match and scrolls inside itself. */}
          {/* The player and the queue share a row; everything below it runs
              the full width again.

              The modal keeps its width and the player gives up the space —
              widening it instead pushed the dialog out towards the edges of
              the screen every time something was queued, so the whole page
              moved because of a list. */}
          {/* Backdrop / player area */}
          <div
            ref={playerAreaRef}
            className={cn(
              "relative w-full overflow-hidden bg-black",
              cinema ? "h-screen" : "aspect-video",
              // Full-bleed, as tall as the screen allows.
              page && "max-h-[86vh]",
            )}
            onMouseMove={revealPlayerControls}
            onTouchStart={revealPlayerControls}
          >
            <PlayerMedia
              item={item}
              videoRef={videoRef}
              mode={mode}
              mini={mini}
              seeked={playback.seeked}
              stillOnly={stillOnly}
              castSrc={castSrc}
              subtitleTracks={subtitleTracks}
              onLoadedMetadata={playback.handleLoadedMetadata}
              onSeeked={() => playback.setSeeked(true)}
              onTimeUpdate={progress.handleTimeUpdate}
              onPause={progress.handlePause}
              onEnded={() => {
                queue.handleEnded();
                // The last video of a session: nothing left to move on to.
                if (leanBack.session && !nextQueuedItem) endLeanBack();
              }}
              onVolumeChange={playback.handleVolumeChange}
            />

            {mode === "playing" && isVideo && !mini && (
              <>
                <PlayerGestures
                  skipSeconds={skipSeconds.current}
                  onSkip={(seconds) => {
                    playback.skip(seconds);
                    revealPlayerControls();
                  }}
                  onTap={revealPlayerControls}
                />
                <SeekStrip
                  duration={item.durationSeconds ?? videoRef.current?.duration ?? 0}
                  currentTime={playback.currentTime}
                  sprite={scrubSprite}
                  bookmarks={bookmarks}
                  markers={markers}
                  heatmap={heatmapBuckets}
                  visible={showPlayerControls}
                  onSeek={seekTo}
                  onJumpToBest={jumpToBestPart}
                  besidePanel={queueOverVideo}
                />
              </>
            )}

            {/* Who's in it, over the video, with the controls. */}
            {mode === "playing" && item?.itemType === "video" && !mini && (
              <XRayPanel performers={item.performers} visible={showPlayerControls} />
            )}

            {queue.showUpNext && nextQueuedItem && !leanBack.session && (
              <UpNextCard item={nextQueuedItem} onPlayNext={queue.playNextQueued} />
            )}

            {leanBack.session && mode === "playing" && !mini && (
              <LeanBackBar
                session={leanBack.session}
                remaining={queue.queueItems.filter((queued) => queued.id !== item?.id).length}
                visible={showPlayerControls}
                onSkip={leanBackDriver.advance}
                onStop={endLeanBack}
              />
            )}

            {/* Gradient + overlaid title/actions, hidden once real playback
              starts so they don't sit on top of the video controls.

              Only on a wide screen. On a phone the picture is small enough
              that a title, six controls and a scrim left nothing of it to
              see, so there the frame carries a single play button and
              everything else moves below it. */}
            {mode === "preview" && !mini && !isMobile && (
              <PreviewOverlay
                item={item}
                canResume={canResume}
                muted={playback.muted}
                watchedPending={toggleWatched.isPending}
                hallOfFamePin={hallOfFamePin}
                onStartPlaying={startPlaying}
                onToggleFavorite={toggleFavorite}
                onToggleWatched={(next) => toggleWatched.mutate(next)}
                onOpenContactSheet={() => setContactSheetOpen(true)}
                onToggleWatchLater={(next) => {
                  if (item) void toggleWatchLater(item, next);
                }}
                onQueue={queue.queueCurrent}
                onSetHallOfFamePin={(id) => setAppearance({ hallOfFamePin: id })}
                onToggleMuted={playback.toggleMuted}
              />
            )}

            {mode === "preview" && !mini && isMobile && item?.itemType === "video" && (
              <MobilePlayButton
                canResume={canResume}
                onPlay={() => startPlaying(canResume ? item.lastPositionSeconds : 0)}
              />
            )}

            {mode === "playing" && item?.itemType === "video" && (
              <PlayerControls
                visible={showPlayerControls}
                mini={mini}
                cinema={cinema}
                discreet={discreet}
                ambient={ambient}
                skipSeconds={skipSeconds.current}
                rate={playback.rate}
                showRates={playback.showRates}
                showSkipOptions={playback.showSkipOptions}
                castAvailable={cast.available}
                casting={cast.casting}
                pipSupported={screenModes.pipSupported}
                hasNextQueued={!!nextQueuedItem}
                onSkip={playback.skip}
                onToggleRates={() => playback.setShowRates((v) => !v)}
                onApplyRate={playback.applyRate}
                onToggleSkipOptions={() => playback.setShowSkipOptions((v) => !v)}
                onApplySkipSeconds={playback.applySkipSeconds}
                onBookmark={addBookmark}
                oCount={item.oCount}
                onCountO={countO}
                subtitleLabel={subtitles.label}
                hasSubtitles={subtitleTracks.length > 0}
                onCycleSubtitles={subtitles.cycle}
                onOpenContactSheet={() => setContactSheetOpen(true)}
                onCast={startCasting}
                onTogglePictureInPicture={() => void screenModes.togglePictureInPicture()}
                onToggleAmbient={toggleAmbient}
                onToggleFullscreen={screenModes.toggleFullscreen}
                onPlayNext={queue.playNextQueued}
                onToggleCinema={() => setCinema((active) => !active)}
              />
            )}

            {!mini && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className={cn(
                  "absolute top-4 z-40 flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-all hover:bg-black/80",
                  // Steps aside for the queue rather than hiding under it.
                  queueOverVideo ? "right-[21.25rem]" : "right-4",
                )}
              >
                <X className="size-5" />
              </button>
            )}
            {mini && onExpand && showPlayerControls && (
              <button
                type="button"
                onClick={onExpand}
                aria-label="Expand player"
                title="Expand player"
                className={cn(
                  "absolute top-4 z-40 flex size-9 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-all hover:bg-black/80",
                  // Steps aside for the queue rather than hiding under it.
                  queueOverVideo ? "right-[21.25rem]" : "right-4",
                )}
              >
                <Maximize2 className="size-4" />
              </button>
            )}

            {/* Over the video rather than beside it. Taking width from the
                player meant the video either got shorter or grew black bars
                down its sides every time the queue opened; floating it leaves
                the player untouched at every size.

                It covers the right of the frame while open, which is the
                trade — but it is open because you are choosing what is next,
                not because you are watching this one. */}
            {queueOverVideo && (
              <aside className="absolute inset-y-0 right-0 z-30 w-[min(20rem,85vw)] border-l border-white/10 bg-black/70 backdrop-blur-md">
                <QueuePanel onPlay={showItem} variant="side" />
              </aside>
            )}
          </div>


          {/* Details */}
          {item && !mini && (
            <ModalSection label="Details" show={page}>
            <DetailsPanel
              item={item}
              isMobile={isMobile}
              editing={editing}
              onToggleEditing={() => setEditing((e) => !e)}
              accent={accent}
              categories={categories}
              bookmarks={bookmarks}
              markers={markers}
              onJumpToBookmark={jumpTo}
              kindPending={updateKind.isPending}
              onChangeKind={(kind) => updateKind.mutate(kind)}
              organisedPending={toggleOrganised.isPending}
              onToggleOrganised={(next) => toggleOrganised.mutate(next)}
              onCountO={countO}
              reframing={reframing}
              setReframing={setReframing}
              framingSaving={saveFraming.isPending}
              onSaveFraming={(next) => saveFraming.mutate(next)}
            />
            </ModalSection>
          )}

          {/* Above "More like this": the gallery belongs to this video, while
            related items lead away from it. */}
          {item && !mini && (
            <div className={cn(page && "mt-12")}>
              <GalleryStrip itemId={item.id} />
            </div>
          )}

          {/* Only ever with something in it. An empty queue below the player
              was a heading and a line of instructions taking up the space
              between the video and what is actually under it — the sidebar's
              queue button is where you go looking for an empty one. */}
          {/* Cinema mode has no side column, so a queue with something in it
              falls back to the stack below. Empty, it stays hidden. */}
          {item?.itemType === "video" &&
            cinema &&
            queue.queueItems.length > 0 && <QueuePanel onPlay={showItem} />}

          {item && cinema && <RelatedItems itemId={item.id} onSelect={showItem} />}

          {item?.itemType === "video" && page && queueBeside && queue.queueItems.length > 0 && (
            <ModalSection label="Your queue" show>
              <QueuePanel onPlay={showItem} />
            </ModalSection>
          )}

          {item && page && (
            <ModalSection label="Up next" show>
              <RelatedItems
                itemId={item.id}
                onSelect={showItem}
                variant="strip"
                source={{ performers: item.performers, studio: item.studio, tags: item.tags }}
              />
            </ModalSection>
          )}
        </div>
      </div>
      {contactSheetOpen && item?.itemType === "video" && !mini && (
        <ContactSheet
          itemId={item.id}
          title={item.title}
          durationSeconds={item.durationSeconds}
          bookmarks={bookmarks}
          heatmapBuckets={heatmapBuckets}
          onPick={(seconds) => {
            setContactSheetOpen(false);
            jumpTo(seconds);
          }}
          onClose={() => setContactSheetOpen(false)}
        />
      )}
    </Portal>
  );
}
