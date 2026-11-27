// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Settings,
  FolderOpen,
  Home,
  Inbox,
  Lock,
  CheckCircle2,
  ChevronDown,
  TriangleAlert,
  Users,
  X,
  Rss,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";
import { CreateCollectionModal } from "./CreateCollectionModal";
import { useIsOwner } from "@/lib/profile";
import { LibraryShortcuts } from "./navParts";
import {
  LIBRARY_LINKS,
  isLibrarySubpage,
  isYouPage,
  useInboxCount,
  useLibraryHealth,
} from "@/lib/navData";

/** Per device: whether Albums, Series and Tags are shown under Library. */
const LIBRARY_OPEN_KEY = "sidebar-library-open";

function readLibraryOpen(): boolean {
  try {
    return localStorage.getItem(LIBRARY_OPEN_KEY) === "true";
  } catch {
    return false;
  }
}

const activeProps = { className: "bg-accent text-foreground font-medium" };

/**
 * The phone's navigation: an off-canvas drawer behind the top bar's menu
 * button. Wider screens have no sidebar — the same places are in the top bar
 * (TopNav).
 */
export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [libraryOpen, setLibraryOpenState] = useState(readLibraryOpen);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const libraryShown = libraryOpen || isLibrarySubpage(pathname);
  function setLibraryOpen(next: boolean) {
    setLibraryOpenState(next);
    try {
      localStorage.setItem(LIBRARY_OPEN_KEY, String(next));
    } catch {
      // Private mode: it just won't be remembered.
    }
  }
  // Inbox, library health and collection management are the owner's.
  const isOwner = useIsOwner();
  const inboxCount = useInboxCount();
  const health = useLibraryHealth();

  // Roomy rows: the pointer here is a fingertip.
  const itemClass =
    "flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  return (
    <aside
      // Taken out of the flow entirely so the content gets the whole
      // viewport, and slid off-screen rather than unmounted so it animates
      // and keeps its scroll position.
      aria-hidden={!open}
      className={cn(
        "cinema-hide focus-hide fixed inset-y-0 left-0 z-50 flex h-dvh w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-2xl transition-transform duration-200 ease-out",
        open ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-[72px] shrink-0 items-center justify-between px-5">
        <Link to="/" aria-label="Home">
          <BrandLogo size="sm" tagline={false} />
        </Link>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          title="Close menu"
          className="-mr-1 flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      <nav
        className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4 pt-2"
        // Following a link should dismiss the drawer, including a link back to
        // the page you are already on, which no route change would catch.
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a")) onClose();
        }}
      >
        <Link to="/" className={itemClass} activeOptions={{ exact: true }} activeProps={activeProps}>
          <Home className="size-4 shrink-0" />
          Home
        </Link>
        <Link to="/feed" className={itemClass} activeProps={activeProps}>
          <Rss className="size-4 shrink-0" />
          Feed
        </Link>

        {/* Library is Browse, with the other ways into the same files folded
            under it. Open while you are on one of them. */}
        <div className="flex items-center">
          <Link to="/browse" className={cn(itemClass, "min-w-0 flex-1")} activeProps={activeProps}>
            <FolderOpen className="size-4 shrink-0" />
            Library
          </Link>
          <button
            type="button"
            onClick={() => setLibraryOpen(!libraryShown)}
            aria-expanded={libraryShown}
            aria-label={libraryShown ? "Hide albums, series and tags" : "Show albums, series and tags"}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronDown className={cn("size-3.5 transition-transform", !libraryShown && "-rotate-90")} />
          </button>
        </div>
        {libraryShown && (
          <div className="ml-4 border-l border-border pl-1.5">
            {LIBRARY_LINKS.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} className={itemClass} activeProps={activeProps}>
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            ))}
          </div>
        )}

        <Link to="/performers" className={itemClass} activeProps={activeProps}>
          <Users className="size-4 shrink-0" />
          Performers
        </Link>
        {isOwner && (
          <Link to="/inbox" className={itemClass} activeProps={activeProps}>
            <Inbox className="size-4 shrink-0" />
            Inbox
            {inboxCount > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                {inboxCount > 99 ? "99+" : inboxCount}
              </span>
            )}
          </Link>
        )}

        <LibraryShortcuts itemClass={itemClass} onCreate={() => setShowCreate(true)} />
      </nav>

      <div className="border-t border-border p-2">
        {isOwner && (
          <Link {...health.link} className={cn(itemClass, "mb-1")} activeProps={activeProps}>
            {health.issues > 0 ? (
              <TriangleAlert className="size-4 shrink-0 text-amber-500" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            )}
            <span className="min-w-0 flex-1 truncate">{health.label}</span>
            {/* The missing page asks for the privacy credential, so the
                padlock says so before you tap rather than after. */}
            {health.missing && <Lock className="size-3 shrink-0 text-muted-foreground/60" />}
          </Link>
        )}
        <Link
          to="/stats"
          className={cn(itemClass, isYouPage(pathname) && "bg-accent font-medium text-foreground")}
        >
          <BarChart3 className="size-4 shrink-0" />
          Your stats
        </Link>
        <Link to="/settings" className={cn(itemClass, "mt-1")} activeProps={activeProps}>
          <Settings className="size-4 shrink-0" />
          Settings
        </Link>
      </div>

      {showCreate && <CreateCollectionModal onClose={() => setShowCreate(false)} />}
    </aside>
  );
}
