// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { Link, useRouterState } from "@tanstack/react-router";
import { Lock, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsOwner } from "@/lib/profile";
import { BrandLogo, BrandMark } from "./BrandLogo";
import {
  isLibrarySubpage,
  isYouPage,
  useInboxCount,
  useLibraryHealth,
} from "@/lib/navData";

/**
 * Plain words, no boxes: the current page is the brighter one, with a short
 * accent rule under it. TanStack's Link marks itself `data-status="active"`.
 */
const linkClass = cn(
  "relative flex h-9 items-center whitespace-nowrap text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
  "after:absolute after:inset-x-0 after:-bottom-0.5 after:mx-auto after:h-0.5 after:w-4 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity",
  "data-[status=active]:text-foreground data-[status=active]:after:opacity-100",
);
const lit = "text-foreground after:opacity-100";

/**
 * The app's navigation on a tablet or wider: the brand and the main places
 * along the top bar. Phones get the same places in a drawer (Sidebar).
 */
export function TopNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isOwner = useIsOwner();
  const inboxCount = useInboxCount();

  return (
    // `contents`: the logo and the links are each placed by the bar's own
    // layout, which moves them between its two shapes.
    <div className="contents">
      <Link to="/" aria-label="Home" data-flip className="masthead-logo flex shrink-0 items-center">
        {/* Folded into the slim bar, the wordmark alone, a size up — grown
            from its left edge so it stays clear of the bar's edge. */}
        <span className="flex origin-left scale-110 transition-[scale] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-[expanded]/bar:scale-100 motion-reduce:transition-none">
          {/* The full wordmark where there's room for it beside the links:
              always as the masthead, from `lg` in the slim bar. */}
          <span className="flex lg:hidden group-data-[expanded]/bar:hidden">
            <BrandMark />
          </span>
          <span className="hidden lg:flex group-data-[expanded]/bar:flex">
            {/* The tagline under the wordmark as the masthead only. */}
            <BrandLogo size="masthead" taglineClassName="mb-2 hidden group-data-[expanded]/bar:block" />
          </span>
        </span>
      </Link>

      <nav
        aria-label="Main"
        data-flip
        className="masthead-nav flex min-w-0 items-center gap-4 lg:gap-6"
      >
        <Link to="/feed" className={linkClass}>
          Feed
        </Link>
        <Link
          to="/browse"
          className={cn(linkClass, (pathname.startsWith("/browse") || isLibrarySubpage(pathname)) && lit)}
        >
          Library
        </Link>
        <Link to="/performers" className={linkClass}>
          Performers
        </Link>
        {isOwner && (
          <Link to="/inbox" className={cn(linkClass, "gap-1.5")}>
            Inbox
            {inboxCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                {inboxCount > 99 ? "99+" : inboxCount}
              </span>
            )}
          </Link>
        )}
        {/* Stats, Activity and Tier list: one place with three tabs. */}
        <Link to="/stats" className={cn(linkClass, isYouPage(pathname) && lit)}>
          You
        </Link>
      </nav>
    </div>
  );
}

/**
 * A warning in the bar when the library has missing files or duplicates.
 * Quiet when all is well: a tick on every page would be noise. The owner's.
 */
export function HealthIndicator() {
  const isOwner = useIsOwner();
  const health = useLibraryHealth();
  if (!isOwner || health.issues === 0) return null;
  return (
    <Link
      {...health.link}
      aria-label={health.label}
      title={health.missing ? `${health.label} — asks for the privacy password` : health.label}
      className="flex h-9 items-center gap-1.5 rounded-full px-2 text-xs font-medium text-amber-500 transition-colors hover:bg-accent"
    >
      <TriangleAlert className="size-4" />
      <span className="tabular-nums">{health.issues}</span>
      {health.missing && <Lock className="size-3 text-muted-foreground/60" />}
    </Link>
  );
}
