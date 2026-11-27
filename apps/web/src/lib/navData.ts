// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

/**
 * What the top bar's navigation and the phone drawer share besides
 * components: the library's links, the inbox count and library health.
 */

import { useQuery } from "@tanstack/react-query";
import { Images, Tag, Tv } from "lucide-react";
import { useLibraryStats } from "@/lib/statsApi";
import { qk } from "@/lib/queryKeys";

/** The ways into the library besides Browse, folded under it. */
export const LIBRARY_LINKS = [
  { to: "/albums", label: "Albums", icon: Images },
  { to: "/series", label: "Series", icon: Tv },
  { to: "/tags", label: "Tags", icon: Tag },
] as const;

/** Pages that count as being "in" the library, besides Browse itself. */
export function isLibrarySubpage(pathname: string): boolean {
  return ["/albums", "/album/", "/series", "/tags"].some((prefix) => pathname.startsWith(prefix));
}

/** Stats, Activity and Tier list are one place with three tabs. */
export function isYouPage(pathname: string): boolean {
  return ["/stats", "/diary", "/tiers"].includes(pathname);
}

export function useInboxCount(): number {
  const { data } = useQuery({
    queryKey: qk.inboxCount,
    queryFn: async () => {
      const res = await fetch("/api/inbox/count");
      if (!res.ok) return { count: 0 };
      return res.json() as Promise<{ count: number }>;
    },
    refetchInterval: 60_000,
  });
  return data?.count ?? 0;
}

/**
 * The library's health, worded and linked by what is wrong.
 *
 * Missing files have a page built to act on them, so that is where the link
 * goes when there are any. With only duplicates — which have a count but no
 * manager yet — the health panel in settings is still the whole story.
 */
export function useLibraryHealth() {
  const { data: health } = useLibraryStats();
  const issues = health ? health.videoMissing + health.videoDuplicateGroups : 0;
  const missing = !!health && health.videoMissing > 0;
  const label = !health
    ? "Library health"
    : health.videoMissing > 0 && health.videoDuplicateGroups > 0
      ? `${issues} library issues`
      : health.videoMissing > 0
        ? `${health.videoMissing} missing`
        : health.videoDuplicateGroups > 0
          ? `${health.videoDuplicateGroups} duplicate${health.videoDuplicateGroups === 1 ? "" : "s"}`
          : "Library healthy";
  const link = missing
    ? ({ to: "/missing" } as const)
    : ({ to: "/settings", search: { tab: "library" } } as const);
  return { issues, missing, label, link };
}
