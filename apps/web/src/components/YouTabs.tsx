// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { Link } from "@tanstack/react-router";

const TABS = [
  { to: "/stats", label: "Stats" },
  { to: "/diary", label: "Activity" },
  { to: "/tiers", label: "Tier list" },
] as const;

/**
 * Your stats, activity and tier list as one place with three tabs, rather than
 * three separate sidebar links. Sits in the page header so it is in the same
 * spot on all three pages, including Stats, whose opening fills the top.
 */
export function YouTabs() {
  return (
    <nav aria-label="You" className="flex rounded-full bg-secondary p-0.5 text-sm ring-1 ring-border">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className="rounded-full px-3 py-1 text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{ className: "bg-background !text-foreground font-medium shadow-sm" }}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
