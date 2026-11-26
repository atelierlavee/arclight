// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/lib/useMediaQuery";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Maximize2, Play } from "lucide-react";
import { AmbientLight } from "./AmbientLight";
import { FlowingRibbons } from "./mediaDetail/FlowingRibbons";
import { GalleryStrip } from "./GalleryStrip";
import { Portal } from "./Portal";
import { RelatedItems } from "./RelatedItems";
import { useAppearance } from "@/lib/appearance";
import { fetchItem, thumbnailUrl } from "@/lib/mediaItemApi";
import { formatTimestamp } from "@/lib/bookmarkApi";
import { bestPartSeconds } from "@/lib/heatmap";
import { cn, formatDuration } from "@/lib/utils";
import { QueuePanel } from "./QueuePanel";
import { SeekStrip } from "./SeekStrip";
import { PlayerGestures } from "./PlayerGestures";
import { XRayPanel } from "./mediaDetail/XRayPanel";
import { DetailsPanel } from "./mediaDetail/DetailsPanel";
import { MiniPlayerHandles } from "./mediaDetail/MiniPlayerHandles";
import { PlayerBar } from "./mediaDetail/PlayerBar";
import { CompactPlayerBar } from "./mediaDetail/CompactPlayerBar";
import { PlayerControls } from "./mediaDetail/PlayerControls";
import { PlayerMedia } from "./mediaDetail/PlayerMedia";
import { PreviewOverlay } from "./mediaDetail/PreviewOverlay";
import { WatchMasthead } from "./mediaDetail/WatchMasthead";
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
import { fetchSeriesDetail, nextEpisodeInSeries } from "@/lib/seriesApi";

/**
 * A section of the watch page: its name as a plain bold heading, then the
 * content.
 */
function WatchSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <h2 className="text-xl font-bold tracking-[-0.01em]">{label}</h2>
      {children}
    </section>
  );
}

type MediaPlayerProps = {
  itemId: number;
  autoPlay?: boolean;
  resume?: boolean;
  onClose: () => void;
  mini?: boolean;
  onExpand?: () => void;
};

export function MediaPlayer({
  itemId,
  autoPlay = false,
  resume = false,
  onClose,
  mini = false,
  onExpand,
}: MediaPlayerProps) {
  const isWatchPage = !mini;
  // Clicking a "More Like This" card swaps the player's content in place.
  const [viewingId, setViewingId] = useState(itemId);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Keep keyboard controls available immediately when a page opens.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  const { data: item } = useQuery({
    queryKey: qk.mediaItem.detail(viewingId),
    queryFn: () => fetchItem(viewingId),
  });
  const seriesId = item?.seriesId;
  const { data: seriesDetail } = useQuery({
    queryKey: qk.series.detail(seriesId),
    queryFn: () => {
      if (seriesId == null) throw new Error("A series ID is required");
      return fetchSeriesDetail(seriesId);
    },
    enabled: isWatchPage && seriesId != null,
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

  const { bookmarks, markers, scrubSprite, heatmapBuckets, categories, addBookmark } =
    usePlayerData({ viewingId, item, mode, mini, videoRef });
  const { updateKind, toggleFavorite, saveFraming, toggleWatched, toggleOrganised, countO } =
    useItemActions({
      viewingId,
      title: item?.title,
      onFramingSaved: () => setReframing(false),
    });

  const toggleWatchLater = useToggleWatchLater();
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  // Whether the live ambient glow is actually on screen.
  const [ambientLit, setAmbientLit] = useState(false);
  // Whether the video is running right now — not paused, not still the
  // preview. Read from the element's own events, so every way of pausing
  // (bar, keyboard, click, end of file) agrees.
  const [videoPlaying, setVideoPlaying] = useState(false);
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

  // The <video> is remounted when the mode changes, so listen afresh each time.
  useEffect(() => {
    const video = videoRef.current;
    if (mode !== "playing" || !video) {
      setVideoPlaying(false);
      return;
    }
    const sync = () => setVideoPlaying(!video.paused && !video.ended);
    sync();
    const events = ["play", "playing", "pause", "ended", "emptied"] as const;
    events.forEach((name) => video.addEventListener(name, sync));
    return () => events.forEach((name) => video.removeEventListener(name, sync));
  }, [mode, viewingId]);

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

  // Whether the player has scrolled out of view, for the now-playing
  // controls that take its place in the header. The header covers the top
  // 60px, so the player counts as gone once it is under that.
  const [stageOut, setStageOut] = useState(false);
  useEffect(() => {
    const area = playerAreaRef.current;
    if (mini || cinema || !area) {
      setStageOut(false);
      return;
    }
    const visibility = new IntersectionObserver(([entry]) => setStageOut(!entry.isIntersecting), {
      rootMargin: "-60px 0px 0px 0px",
    });
    visibility.observe(area);
    return () => visibility.disconnect();
  }, [mini, cinema]);
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
   * Shows another item in this same player, from a clean slate.
   *
   * Everything per-item goes back to how a fresh open would have it — the
   * muted preview, no seek, no cast stream — rather than inheriting the
   * previous item's playing state. Shared by "More Like This", the queue,
   * and a new play request arriving while the mini player is already open.
   */
  function showItem(id: number) {
    if (isWatchPage && id !== itemId) {
      void navigate({
        to: "/watch/$itemId",
        params: { itemId: String(id) },
        search: {},
        replace: true,
      });
    }
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
    if (isWatchPage) window.scrollTo({ top: 0 });
    else scrollRef.current?.scrollTo({ top: 0 });
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
  const progressDuration =
    item?.durationSeconds ?? videoRef.current?.duration ?? 0;
  const progressSeconds =
    mode === "playing" ? playback.currentTime : item?.lastPositionSeconds ?? 0;
  const progressPercent =
    Number.isFinite(progressDuration) && progressDuration > 0
      ? Math.min(100, Math.max(0, Math.round((progressSeconds / progressDuration) * 100)))
      : 0;
  const nextEpisode =
    item && seriesDetail
      ? nextEpisodeInSeries(seriesDetail, item.id)
      : null;
  const canResumeNextEpisode =
    !!nextEpisode &&
    nextEpisode.lastPositionSeconds !== null &&
    nextEpisode.lastPositionSeconds > MIN_RESUMABLE_SECONDS &&
    (nextEpisode.durationSeconds === null ||
      nextEpisode.lastPositionSeconds <
        nextEpisode.durationSeconds - MIN_RESUMABLE_SECONDS);

  // The title, who's in it, and what you can do with it.
  const masthead = item && (
    <WatchMasthead
      item={item}
      seriesName={seriesDetail?.name ?? null}
      playing={mode === "playing"}
      canResume={canResume}
      editing={editing}
      isOwner={isOwner}
      watchedPending={toggleWatched.isPending}
      organisedPending={toggleOrganised.isPending}
      hallOfFamePin={hallOfFamePin}
      onStartPlaying={startPlaying}
      onToggleFavorite={toggleFavorite}
      onToggleWatched={(next) => toggleWatched.mutate(next)}
      onToggleWatchLater={(next) => void toggleWatchLater(item, next)}
      onOpenContactSheet={() => setContactSheetOpen(true)}
      onQueue={queue.queueCurrent}
      onSetHallOfFamePin={(id) => setAppearance({ hallOfFamePin: id })}
      onCountO={countO}
      onToggleOrganised={(next) => toggleOrganised.mutate(next)}
    />
  );

  // The next episode of a series: its still beside its name, no card.
  const nextEpisodeLink = nextEpisode && seriesDetail && (
    <WatchSection label="Next episode">
      <button
        type="button"
        onClick={() =>
          void navigate({
            to: "/watch/$itemId",
            params: { itemId: String(nextEpisode.id) },
            search: {
              autoplay: true,
              resume: canResumeNextEpisode || undefined,
            },
          })
        }
        className="group -mx-3 flex w-[calc(100%+1.5rem)] max-w-xl items-center gap-4 rounded-2xl p-3 text-left transition-colors hover:bg-white/[0.05]"
      >
        <span className="relative block aspect-video w-36 shrink-0 overflow-hidden rounded-xl bg-secondary sm:w-48">
          <img
            src={thumbnailUrl(nextEpisode)}
            alt=""
            className="sensitive size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary text-white shadow-[0_0_32px_-6px_rgba(255,45,149,0.9)]">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
          </span>
        </span>
        <span className="min-w-0 space-y-1">
          <span className="sensitive block truncate text-[13px] text-zinc-400">
            {seriesDetail.name} · S{nextEpisode.seasonNumber ?? 1}
            {nextEpisode.episodeNumber != null && ` E${nextEpisode.episodeNumber}`}
          </span>
          <span className="sensitive line-clamp-2 block text-base font-bold leading-snug transition-colors group-hover:text-primary">
            {nextEpisode.episodeTitle || nextEpisode.title}
          </span>
          <span className="block text-[13px] text-zinc-500">
            {canResumeNextEpisode
              ? `Resume at ${formatTimestamp(nextEpisode.lastPositionSeconds ?? 0)}`
              : formatDuration(nextEpisode.durationSeconds) || "Play next episode"}
          </span>
        </span>
      </button>
    </WatchSection>
  );

  // The record: positions, the story, the facts, and your own notes on it.
  const details = item && (
    <DetailsPanel
      item={item}
      key={item.id}
      currentTime={mode === "playing" ? playback.currentTime : null}
      editing={editing}
      canEdit={!isMobile && isOwner}
      onToggleEditing={() => setEditing((e) => !e)}
      categories={categories}
      bookmarks={bookmarks}
      markers={markers}
      onJumpToBookmark={jumpTo}
      kindPending={updateKind.isPending}
      onChangeKind={(kind) => updateKind.mutate(kind)}
      reframing={reframing}
      setReframing={setReframing}
      framingSaving={saveFraming.isPending}
      onSaveFraming={(next) => saveFraming.mutate(next)}
    />
  );

  const content = (
    <>
      <div
        ref={scrollRef}
        className={cn(
          isWatchPage ? "relative min-h-screen w-full bg-background pb-24" : "z-50",
        )}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          aria-label={item?.title ?? "Media player"}
          className={cn(
            "relative overflow-hidden bg-card shadow-2xl focus:outline-none",
            isWatchPage
              ? "min-h-full w-full bg-background"
              : "pointer-events-auto fixed z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg ring-1 ring-border",
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
        >
          {mini && (
            <MiniPlayerHandles
              showDragHandle={!!item}
              visible={showPlayerControls}
              dragHandlers={dragHandlers}
              resizeHandlers={resizeHandlers}
            />
          )}
          {/* The watch page: one centred column — the video as a rounded
              screen, its title and actions, the details as tabs, then what
              to watch next.

              The video sits at the same place in the tree in every mode, so
              switching cinema on or off never remounts it mid-playback. */}
          <div
            className={cn(
              page && "mx-auto w-full max-w-[1276px] px-4 pt-[60px] md:px-12 md:pt-[76px]",
            )}
          >
            <div className={cn(page && "space-y-8")}>
              <div className={cn(page && "relative -mx-4 md:mx-0")}>
                {/* A halo just outside the screen in the picture's colours,
                    drawn behind it rather than behind the whole page — where
                    the panel's own background used to cover it. */}
                {/* The silk only while the video is actually playing, and
                    never with the live glow: it gives way once the glow is
                    really showing — not just switched on. */}
                {page && <FlowingRibbons visible={videoPlaying && !ambientLit} />}
                {page && (
                  <AmbientLight
                    videoRef={videoRef}
                    active={ambient && isVideo && mode === "playing" && !discreet}
                    onLitChange={setAmbientLit}
                  />
                )}
          {/* The player and the queue share a row. The player keeps its
              aspect ratio and so decides the row's height; the queue column
              stretches to match and scrolls inside itself. */}
          {/* The player and the queue share a row; everything below it runs
              the full width again.

              The mini player keeps its width and the player gives up the space —
              widening it instead pushed the content out towards the edges of
              the screen every time something was queued, so the whole view
              moved because of a list. */}
          {/* Backdrop / player area */}
          <div
            ref={playerAreaRef}
            className={cn(
              "relative w-full overflow-hidden bg-black",
              cinema ? "h-screen" : "aspect-video",
              // Edge to edge on a phone; a rounded screen in the column above that.
              page && "md:rounded-[20px] md:shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]",
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
              onVideoClick={() => {
                playback.togglePlay();
                revealPlayerControls();
              }}
              onVideoDoubleClick={screenModes.toggleFullscreen}
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
            {/* A play button over the still, and mute. The title and the
                actions are in the masthead under the video. */}
            {mode === "preview" && !mini && (
              <PreviewOverlay
                item={item}
                canResume={canResume}
                muted={playback.muted}
                onStartPlaying={startPlaying}
                onToggleMuted={playback.toggleMuted}
                progressPercent={progressPercent}
              />
            )}

            {mode === "playing" && item?.itemType === "video" && !mini && (
              <PlayerBar
                videoRef={videoRef}
                visible={showPlayerControls}
                currentTime={playback.currentTime}
                duration={item.durationSeconds ?? videoRef.current?.duration ?? 0}
                besidePanel={queueOverVideo}
                onTogglePlay={playback.togglePlay}
                onToggleMuted={playback.toggleMuted}
                onToggleFullscreen={screenModes.toggleFullscreen}
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
                onPlayNext={queue.playNextQueued}
                onToggleCinema={() => setCinema((active) => !active)}
              />
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
              </div>
              {page ? (
                // Above the glow and the silk behind the player, which are
                // positioned layers and would otherwise paint over the text.
                <div key={viewingId} className="relative z-[1] space-y-8">
                  {/* The page arrives in a short cascade: title, then
                      details, then what's next. */}
                  <div className="animate-fade-up">{masthead}</div>
                  <div className="animate-fade-up pt-4 [animation-delay:90ms]">{details}</div>
                  {nextEpisodeLink && <div className="pt-6">{nextEpisodeLink}</div>}
                  {item?.itemType === "video" && queueBeside && queue.queueItems.length > 0 && (
                    <div className="max-w-xl pt-6">
                      <QueuePanel onPlay={showItem} variant="rail" />
                    </div>
                  )}
                  {item && (
                    <div className="animate-fade-up pb-16 pt-6 [animation-delay:180ms]">
                      <WatchSection label="Up next">
                        <RelatedItems
                          itemId={item.id}
                          onSelect={showItem}
                          variant="grid"
                          source={{ performers: item.performers, studio: item.studio, tags: item.tags }}
                        />
                      </WatchSection>
                    </div>
                  )}
                  {item && (
                    <CompactPlayerBar
                      item={item}
                      videoRef={videoRef}
                      visible={stageOut}
                      markers={markers}
                      playing={videoPlaying}
                      currentTime={mode === "playing" ? playback.currentTime : item.lastPositionSeconds}
                      duration={item.durationSeconds ?? videoRef.current?.duration ?? 0}
                      onTogglePlay={() =>
                        mode === "playing"
                          ? playback.togglePlay()
                          : startPlaying(canResume ? item.lastPositionSeconds : 0)
                      }
                      onBackToVideo={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    />
                  )}
                </div>
              ) : (
                !mini && (
                  <>
                    {masthead && <div className="px-4 pt-6 md:px-6">{masthead}</div>}
                    {details && <div className="mt-12 px-4 md:px-6">{details}</div>}
                    {item && (
                      <div className="mt-12">
                        <GalleryStrip itemId={item.id} />
                      </div>
                    )}
                    {/* Cinema mode has its own stack, so a queue with something in
                        it falls back to the stack below. Empty, it stays hidden. */}
                    {item?.itemType === "video" && cinema && queue.queueItems.length > 0 && (
                      <QueuePanel onPlay={showItem} />
                    )}
                    {item && cinema && <RelatedItems itemId={item.id} onSelect={showItem} />}
                  </>
                )
              )}
            </div>
          </div>
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
    </>
  );
  return isWatchPage ? content : <Portal lockPageScroll={false}>{content}</Portal>;
}
