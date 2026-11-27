// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, Menu, Search, X } from "lucide-react";
import { SEARCH_SHORTCUT } from "@/lib/appearance";
import { useIsMobile } from "@/lib/useMediaQuery";
import { Screensaver } from "./Screensaver";
import { DiscreetUnlockDialog } from "./DiscreetUnlockDialog";
import { PrivacyUnlockPrompt } from "./PrivacyUnlockPrompt";
import { SpotlightSearch, openSpotlight } from "./SpotlightSearch";
import { AppFooter } from "./AppFooter";
import { Sidebar } from "./Sidebar";
import { HealthIndicator, TopNav } from "./TopNav";
import { useMasthead } from "./useMasthead";
import { UserMenu } from "./UserMenu";
import { cn } from "@/lib/utils";
import { MediaPlayer } from "./MediaPlayer";
import { ShellContext, type PageHeader } from "./shellContext";
import { NotificationCenter } from "./NotificationCenter";
import { CardShortcutProvider } from "@/lib/cardShortcuts";
import type { PlayItemDetail } from "@/lib/appEvents";
import { useAchievementWatcher } from "@/lib/useAchievementWatcher";
import { useScrollLock } from "@/lib/scrollLock";

/**
 * The root route's component: the frame every page renders inside.
 *
 * Mounted once for the life of the app rather than once per page, so what
 * lives in it — the mini player above all, but also the queue, screensaver
 * and search — survives navigation instead of being torn down and rebuilt by
 * every route change.
 */
export function AppLayout() {
  return (
    <ShellFrame>
      <Outlet />
    </ShellFrame>
  );
}

/**
 * A page's title, subtitle and header actions.
 *
 * No longer the shell itself: the frame is AppLayout at the root route. This
 * hands the page's header up to it and renders the content in place, so
 * pages keep writing `<AppShell title=…>` exactly as before.
 */
export function AppShell(props: PageProps) {
  const shell = useContext(ShellContext);
  // Outside the layout — the root route's own error fallback — there is no
  // frame to report to, so this brings its own rather than rendering a page
  // with no way out of it.
  if (!shell) {
    return (
      <ShellFrame>
        <ShellPage {...props} />
      </ShellFrame>
    );
  }
  return <ShellPage {...props} />;
}

type PageProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  /** For pages whose content is a centred column, so the two agree. */
  centeredHeader?: boolean;
  /**
   * The page draws its own heading (a pinned one, say), so the shell skips
   * the block above the content. The title still names the page in the
   * phone's top bar.
   */
  ownHeading?: boolean;
  actions?: React.ReactNode;
};

function ShellPage({
  children,
  title,
  subtitle,
  centeredHeader = false,
  ownHeading = false,
  actions,
}: PageProps) {
  const shell = useContext(ShellContext);
  const setHeader = shell?.setHeader;
  const owner = useId();

  // A layout effect so the header is right on the first paint rather than
  // one frame behind the page under it. Only primitives go up — `actions`
  // is portalled instead, since a fresh element every render would re-render
  // the frame, and with it this page, forever.
  useLayoutEffect(() => {
    if (!setHeader) return;
    setHeader({ owner, title, subtitle, centeredHeader, ownHeading });
    return () =>
      setHeader((current) => (current?.owner === owner ? null : current));
  }, [setHeader, owner, title, subtitle, centeredHeader, ownHeading]);

  return (
    <>
      {actions && shell?.actionsSlot && createPortal(actions, shell.actionsSlot)}
      {children}
    </>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [header, setHeader] = useState<PageHeader | null>(null);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const [startSlot, setStartSlot] = useState<HTMLElement | null>(null);
  const title = header?.title;
  const subtitle = header?.subtitle;
  const centeredHeader = header?.centeredHeader ?? false;
  const ownHeading = header?.ownHeading ?? false;
  const store = useMemo(() => ({ setHeader, actionsSlot, startSlot }), [actionsSlot, startSlot]);
  const isMobile = useIsMobile();
  // Tablet and up: a tall masthead at the top of the page that folds into
  // the slim bar as you scroll.
  const { ref: mastheadRef, expanded: mastheadExpanded } = useMasthead(!isMobile);
  useAchievementWatcher();
  const [drawerRequested, setDrawerRequested] = useState(false);
  // Derived rather than reset by an effect, so growing past `md` with the
  // drawer open can never leave a stale overlay over the desktop layout.
  const drawerOpen = isMobile && drawerRequested;
  const [playingId, setPlayingId] = useState<number | null>(null);
  // Read by the play-request listener, which is registered once.
  const playingIdRef = useRef<number | null>(null);
  playingIdRef.current = playingId;
  // Bumped when the loaded item is requested again, to restart playback.
  const [playRequest, setPlayRequest] = useState(0);
  const [miniPlayer, setMiniPlayer] = useState(false);
  const [resumePlayer, setResumePlayer] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [scrolled, setScrolled] = useState(() => window.scrollY > 0);
  // Keying the main region on the path re-runs its entry animation on every
  // navigation, so pages fade in rather than snapping into place.
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  // Navigation closes the drawer and clears a player that is not in mini mode.
  // The mini player is meant to survive navigation, so it is left alone.
  // Adjusted during render rather than in an effect, so the new page never
  // paints with the old player still over it.
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (seenPathname !== pathname) {
    setSeenPathname(pathname);
    setDrawerRequested(false);
    if (!miniPlayer) {
      setPlayingId(null);
      setResumePlayer(false);
    }
  }

  useEffect(() => {
    const updateScrolled = () => setScrolled(window.scrollY > 0);
    updateScrolled();
    window.addEventListener("scroll", updateScrolled, { passive: true });
    return () => window.removeEventListener("scroll", updateScrolled);
  }, []);

  // The drawer sits over the page, so the page behind it must not scroll.
  // Through the overlays' shared count so nested overlays restore scrolling
  // only after the last one closes.
  useScrollLock(drawerOpen);

  useEffect(() => {
    function resumeItem(event: Event) {
      const detail = (
        event as CustomEvent<number | PlayItemDetail>
      ).detail;
      const id = typeof detail === "number" ? detail : detail?.id;
      if (typeof id !== "number") return;
      if (typeof detail !== "number" && detail.watchPage === true) {
        setPlayingId(null);
        setMiniPlayer(false);
        setResumePlayer(false);
        void navigate({
          to: "/watch/$itemId",
          params: { itemId: String(id) },
          search: {
            autoplay: detail.autoPlay || undefined,
            resume: detail.resume || undefined,
          },
        });
        return;
      }
      // Re-requesting the current mini-player item changes no prop; remount
      // it so a second Play or Resume request is honoured.
      if (playingIdRef.current === id) setPlayRequest((n) => n + 1);
      setPlayingId(id);
      setMiniPlayer(true);
      setResumePlayer(typeof detail !== "number" && detail.resume === true);
    }
    window.addEventListener("media-server:play-item", resumeItem);
    return () =>
      window.removeEventListener("media-server:play-item", resumeItem);
  }, [navigate]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && focusMode) {
        event.preventDefault();
        setFocusMode(false);
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey)
        return;
      if (event.code !== "KeyF") return;
      event.preventDefault();
      setFocusMode((active) => !active);
    }
    function onToggle() {
      setFocusMode((active) => !active);
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("media-server:toggle-focus", onToggle);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("media-server:toggle-focus", onToggle);
    };
  }, [focusMode]);

  return (
    <ShellContext.Provider value={store}>
      <div
        className={cn(
          "flex min-h-dvh bg-background text-foreground",
          focusMode && "focus-mode",
        )}
      >
        {/* Phones only: wider screens carry the same places in the top bar. */}
        {isMobile && (
          <Sidebar open={drawerOpen} onClose={() => setDrawerRequested(false)} />
        )}

        {isMobile && drawerOpen && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerRequested(false)}
            className="animate-fade-in fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* The navigation on the left (a menu button on phones), the
              actions on the right. Laid over the top of the page, so a
              full-bleed opening shot runs up under it. */}
          <header
            ref={mastheadRef}
            data-expanded={mastheadExpanded || undefined}
            className={cn(
              // `masthead` takes over the layout from `md` (index.css).
              "masthead group/bar cinema-hide focus-hide sticky top-0 z-30 -mb-[60px] flex h-[60px] shrink-0 items-center justify-between gap-2 px-4 py-3 transition-colors duration-300 md:gap-4 md:px-6",
              // Frosted once the page moves under it, so what scrolls beneath
              // still shows through softly instead of meeting a solid band.
              // Before that — and while it's the tall masthead — a faint
              // shade keeps the links legible over a bright opening image.
              scrolled && !mastheadExpanded
                ? "bg-background/70 backdrop-blur-xl backdrop-saturate-150"
                : "bg-gradient-to-b from-background/60 to-transparent",
            )}
          >
            <span aria-hidden className="masthead-rule hidden md:block" />

            {/* On phones the sidebar is behind a button, so the header carries
                the only way to reach it — and the page title with it. */}
            <div className="flex min-w-0 items-center gap-2 md:hidden">
              <button
                type="button"
                onClick={() => setDrawerRequested(true)}
                aria-label="Open menu"
                aria-expanded={drawerOpen}
                className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Menu className="size-5" />
              </button>
              <span className="truncate text-sm font-semibold tracking-tight">
                {title ?? "Arc Light"}
              </span>
            </div>
            {/* A page's own content (the watch page's now-playing controls),
                in the slim bar between the logo and the links — beside the
                links, never in place of them, so the bar is the same on
                every page. Only from `xl`, where there's room for both. */}
            <div
              ref={setStartSlot}
              className="masthead-slot hidden min-w-0 items-center justify-center xl:flex"
            />
            {!isMobile && <TopNav />}
            <div data-flip className="masthead-actions flex shrink-0 items-center gap-1.5 md:gap-3">
              {/* The current page's actions are portalled in here. `contents`
                  so they sit in this row's flex layout as if written inline. */}
              <div ref={setActionsSlot} className="contents" />
              {!isMobile && <HealthIndicator />}
              <NotificationCenter />
              <button
                type="button"
                onClick={openSpotlight}
                aria-label="Search"
                title={`Search (${SEARCH_SHORTCUT})`}
                className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground ring-1 ring-border transition-colors hover:bg-accent hover:text-foreground"
              >
                <Search className="size-4" />
              </button>
              <UserMenu />
            </div>
          </header>
          {/* The room the tall masthead needs at the top of the page. Fixed,
              not folding with it, so the page never shifts under the bar. */}
          <div aria-hidden className="cinema-hide focus-hide hidden h-[var(--masthead-room)] shrink-0 md:block" />

          {focusMode && (
            <div className={cn(
              "animate-toolbar-in sticky top-0 z-30 -mb-12 flex h-12 shrink-0 items-center gap-2 px-4 py-2 transition-colors",
              scrolled ? "bg-background" : "bg-transparent",
            )}>
              <button
                type="button"
                onClick={() => window.history.back()}
                aria-label="Go back"
                title="Go back"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
              </button>
              <div className="min-w-0 flex-1 px-2">
                <p className="truncate text-sm font-medium">
                  {title ?? "Library"}
                </p>
                {subtitle && (
                  <p className="truncate text-[11px] text-muted-foreground">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={openSpotlight}
                aria-label="Search"
                title={`Search (${SEARCH_SHORTCUT})`}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Search className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setFocusMode(false)}
                aria-label="Exit Focus Mode"
                title="Exit Focus Mode (Esc)"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {(title || subtitle) && !ownHeading && (
            // Centred only where the page beneath it is centred too — a heading
            // on a different axis to its own content reads as a mistake.
            <div
              className={cn(
                "px-4 md:px-6",
                focusMode
                  ? "pt-[68px] md:pt-[72px]"
                  : // On a phone the h1 is hidden (the top bar names the
                    // page), so a page with no subtitle needs only enough to
                    // clear the bar — but it does need that: hiding the whole
                    // block left the page's content underneath the bar.
                    subtitle
                    ? "pt-20 md:pt-[84px]"
                    : "pt-12 md:pt-[84px]",
                centeredHeader && "text-center",
              )}
            >
              {title && (
                <h1 className="hidden text-xl font-bold tracking-tight md:block md:text-2xl">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
          )}

          <main key={pathname} className="min-w-0 flex-1 animate-fade-in">
            {/* Inside the shell so every page gets the card shortcuts, and
                outside any one page so there is a single listener rather than
                one per grid or row. */}
            <CardShortcutProvider>{children}</CardShortcutProvider>
          </main>

          <div className="cinema-hide focus-hide">
            <AppFooter />
          </div>
        </div>

        {playingId !== null && (
          <MediaPlayer
            key={playRequest}
            itemId={playingId}
            autoPlay={miniPlayer}
            resume={resumePlayer}
            mini={miniPlayer}
            onExpand={() => {
              const id = playingId;
              if (id === null) return;
              setMiniPlayer(false);
              setPlayingId(null);
              setResumePlayer(false);
              void navigate({
                to: "/watch/$itemId",
                params: { itemId: String(id) },
                search: { autoplay: true, resume: true },
              });
            }}
            onClose={() => {
              setPlayingId(null);
              setMiniPlayer(false);
              setResumePlayer(false);
            }}
          />
        )}

        <Screensaver />
        <DiscreetUnlockDialog />
        <PrivacyUnlockPrompt />
        <SpotlightSearch />
      </div>
    </ShellContext.Provider>
  );
}
