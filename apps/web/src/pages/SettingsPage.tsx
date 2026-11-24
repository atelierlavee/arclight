// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle2,
  Copy,
  HardDrive,
  Search,
  ShieldAlert,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AppearancePanel } from "@/components/AppearanceMenu";
import { AppearanceSettingsSection } from "@/components/AppearanceSettingsSection";
import { BackupSettingsSection } from "@/components/BackupSettingsSection";
import { CategorySettings } from "@/components/CategorySettings";
import { HeroSettingsSection } from "@/components/HeroSettingsSection";
import { LibraryCleanupSection } from "@/components/LibraryCleanupSection";
import { LibrarySettingsSection } from "@/components/LibrarySettingsSection";
import { LibraryHealthSection } from "@/components/LibraryHealthSection";
import { DuplicatesSection } from "@/components/DuplicatesSection";
import { CacheSettingsSection } from "@/components/CacheSettingsSection";
import { NetworkSettingsSection } from "@/components/NetworkSettingsSection";
import { PrivacySettingsSection } from "@/components/PrivacySettingsSection";
import { ActivityLogSection } from "@/components/ActivityLogSection";
import { StorageInsightsSection } from "@/components/StorageInsightsSection";
import { cn } from "@/lib/utils";
import { useIsOwner } from "@/lib/profile";
import { ProfilesSettingsSection } from "@/components/ProfilesSettingsSection";
import { settingsInputClass } from "@/components/SettingsSection";
import { APPEARANCE_SHORTCUT } from "@/lib/appearance";
import { settingsAnchor } from "@/lib/settingsAnchor";
import { formatBytes, useLibraryStats } from "@/lib/statsApi";
import { backupAgeDays, isBackupStale } from "@/lib/backupApi";

const routeApi = getRouteApi("/settings");

/**
 * Two groups: your own settings, which every profile has, then the library
 * and the server, which only the owner manages. They used to sit in one row
 * of seven tabs, so a personal choice meant reading past admin chores and a
 * non-owner profile saw a page with gaps in it.
 */
const TABS = [
  { id: "appearance", label: "Appearance", group: "you" },
  { id: "homepage", label: "Homepage", group: "you" },
  { id: "privacy", label: "Privacy", group: "you" },
  { id: "profiles", label: "Profiles", group: "you" },
  { id: "library", label: "Library", group: "server" },
  { id: "server", label: "Server", group: "server" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** Tabs that were folded into others, so old links still land somewhere. */
const MOVED: Record<string, { tab: TabId; anchor: string }> = {
  storage: { tab: "library", anchor: settingsAnchor("Storage") },
  backup: { tab: "server", anchor: settingsAnchor("Backup") },
  activity: { tab: "server", anchor: "activity-title" },
};

/**
 * Every section, with the words someone might look for it by — what it is
 * called, what it does, and the plainer words for the same thing. Searched
 * instead of the rendered page, so a match on a tab you aren't on is found
 * too. Ordered as the tabs are.
 */
const SETTINGS_INDEX: { tab: TabId; title: string; anchor: string; words: string }[] = [
  { tab: "appearance", title: "Discreet mode", anchor: "appearance", words: "blur hide images text privacy" },
  {
    tab: "appearance",
    title: "Playback",
    anchor: "appearance",
    words: "autoplay next screensaver ambient light preview",
  },
  {
    tab: "appearance",
    title: "Interface",
    anchor: "appearance",
    words: "motion animation accent colour color corner radius text size type scale theme",
  },
  { tab: "appearance", title: "Banner", anchor: "appearance", words: "hero height header" },
  {
    tab: "appearance",
    title: "Layout",
    anchor: "appearance",
    words: "tile size grid list density labels shape preset cards",
  },
  {
    tab: "homepage",
    title: "Hero slider",
    anchor: settingsAnchor("Hero slider"),
    words: "banner top home rotate featured",
  },
  {
    tab: "homepage",
    title: "Homepage layout",
    anchor: settingsAnchor("Homepage layout"),
    words: "home rows sections order hide show customize customise reset",
  },
  {
    tab: "homepage",
    title: "Categories",
    anchor: settingsAnchor("Categories"),
    words: "home tiles kinds cover rename",
  },
  {
    tab: "privacy",
    title: "Privacy",
    anchor: settingsAnchor("Privacy"),
    words: "discreet blur password touch id lock unlock pin hide",
  },
  {
    tab: "profiles",
    title: "Profiles",
    anchor: settingsAnchor("Profiles"),
    words: "people users accounts pin switch",
  },
  {
    tab: "library",
    title: "Library health",
    anchor: "library-health-title",
    words: "missing files offline drive scan problems issues rescan",
  },
  {
    tab: "library",
    title: "Duplicates",
    anchor: settingsAnchor("Duplicates"),
    words: "same file twice copies hash",
  },
  {
    tab: "library",
    title: "Folders to scan",
    anchor: settingsAnchor("Folders to scan"),
    words: "library path drive directory add folder scanner import media root",
  },
  {
    tab: "library",
    title: "Storage",
    anchor: settingsAnchor("Storage"),
    words: "disk space size largest quality space map",
  },
  {
    tab: "library",
    title: "Left over from removed folders",
    anchor: settingsAnchor("Left over from removed folders"),
    words: "cleanup orphaned old data delete danger",
  },
  { tab: "server", title: "Backup", anchor: settingsAnchor("Backup"), words: "restore export database save" },
  {
    tab: "server",
    title: "Local network access",
    anchor: settingsAnchor("Local network access"),
    words: "wifi phone tablet lan other devices qr",
  },
  { tab: "server", title: "Activity history", anchor: "activity-title", words: "log history changes audit" },
  {
    tab: "server",
    title: "Cache",
    anchor: settingsAnchor("Cache"),
    words: "thumbnails artwork clear regenerate images danger",
  },
];

export function SettingsPage() {
  const { tab } = routeApi.useSearch();
  const isOwner = useIsOwner();
  // The library and the server are the owner profile's; anyone else gets
  // only their own group.
  const tabs = TABS.filter((t) => isOwner || t.group === "you");
  const moved = tab ? MOVED[tab] : undefined;
  const wanted = moved?.tab ?? tab;
  // An unknown tab in the URL falls back rather than rendering an empty page.
  const active: TabId = tabs.some((t) => t.id === wanted) ? (wanted as TabId) : tabs[0].id;

  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // Where a picked result should land once its tab has rendered — or, for
  // an old link to a tab that moved, where that tab's content went.
  const [target, setTarget] = useState<string | null>(moved?.anchor ?? null);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length
    ? SETTINGS_INDEX.filter((entry) => tabs.some((t) => t.id === entry.tab)).filter((entry) => {
        const haystack = `${entry.title} ${entry.words} ${entry.tab}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
    : [];

  useEffect(() => {
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setTarget(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [target, active]);

  function open(entry: { tab: TabId; anchor: string }) {
    setQuery("");
    setTarget(entry.anchor);
    void navigate({ to: "/settings", search: { tab: entry.tab } });
  }

  return (
    <AppShell title="Settings" subtitle="Your own preferences, and the library's." centeredHeader>
      {/* A settings column centred in the page rather than pinned to the
          left edge: the sections are a fixed, readable width, and on a wide
          screen that left everything hugging one side with a screen of empty
          space beside it. Appearance gets more room for its two columns. */}
      <div
        className={cn(
          "mx-auto w-full px-4 py-6 md:px-6",
          active === "appearance" && !terms.length ? "max-w-4xl" : "max-w-2xl",
        )}
      >
        {/* A form of its own, so a browser never takes this box for the
            username belonging to a password field elsewhere on the page. */}
        <form
          role="search"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            if (results[0]) open(results[0]);
          }}
          className="relative mx-auto mb-4 max-w-2xl"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            // Not a username: with password fields further down the page,
            // browsers and password managers otherwise fill your username in.
            name="settings-search"
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            placeholder="Search settings — try “password”, “tile size” or “backup”"
            aria-label="Search settings"
            // It draws its own clear button; the browser's would be a second ✕.
            className={cn(settingsInputClass, "pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none")}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </form>

        {terms.length > 0 ? (
          <ul className="divide-y divide-border/60 rounded-lg border border-border bg-card/40">
            {results.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing in settings matches “{query.trim()}”.
              </li>
            )}
            {results.map((entry) => (
              <li key={`${entry.tab}:${entry.title}`}>
                <button
                  type="button"
                  onClick={() => open(entry)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-accent"
                >
                  <span className="text-sm font-medium">{entry.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {TABS.find((t) => t.id === entry.tab)?.label}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <nav
              // Scrolls on a phone rather than pushing the whole page sideways.
              className="scrollbar-hide -mx-4 flex items-end gap-1 overflow-x-auto border-b border-border px-4 md:mx-0 md:justify-center md:overflow-visible md:px-0"
            >
              {tabs.map((entry, index) => (
                <div key={entry.id} className="flex shrink-0 items-end">
                  {/* A gap and a label between the two groups. */}
                  {index > 0 && entry.group !== tabs[index - 1].group && (
                    <span className="mx-2 mb-2 h-5 w-px bg-border" aria-hidden />
                  )}
                  <Link
                    to="/settings"
                    search={{ tab: entry.id }}
                    className={cn(
                      // The underline sits on the nav's own border, so switching
                      // tabs doesn't shift the content below by a pixel.
                      "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                      active === entry.id
                        ? "border-foreground font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {entry.label}
                  </Link>
                </div>
              ))}
            </nav>
            {isOwner && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
                {TABS.find((t) => t.id === active)?.group === "you"
                  ? "Your settings — each profile has its own."
                  : "Library & server — for everyone using this server."}
              </p>
            )}

            {/* Keyed on the tab so each panel mounts fresh — a half-typed password
                or an open editor doesn't survive a switch to somewhere unrelated
                and back. */}
            <div key={active} className="stagger space-y-5 py-6">
              {active === "appearance" && (
                <section
                  id="appearance"
                  className="w-full scroll-mt-24 rounded-lg border border-border bg-card/40 p-5"
                >
                  <AppearancePanel inline />
                  <p className="mt-5 border-t border-border pt-3 text-xs text-muted-foreground">
                    Changes save as you make them. The same controls open over any page with{" "}
                    <kbd className="rounded border border-border bg-secondary px-1 font-sans text-[11px]">
                      {APPEARANCE_SHORTCUT}
                    </kbd>
                    , so you can judge them against the real thing.
                  </p>
                </section>
              )}
              {active === "homepage" && (
                <>
                  {isOwner && <HeroSettingsSection />}
                  <AppearanceSettingsSection />
                  {isOwner && <CategorySettings />}
                </>
              )}
              {active === "privacy" && <PrivacySettingsSection />}
              {active === "profiles" && <ProfilesSettingsSection />}
              {active === "library" && (
                <>
                  <LibraryStatus onJump={open} />
                  <LibraryHealthSection />
                  <QuietWhenClear>
                    <DuplicatesSection />
                  </QuietWhenClear>
                  <LibrarySettingsSection />
                  <StorageInsightsSection />
                  <DangerZone>
                    <LibraryCleanupSection />
                  </DangerZone>
                </>
              )}
              {active === "server" && (
                <>
                  <BackupSettingsSection />
                  <NetworkSettingsSection />
                  <ActivityLogSection />
                  <DangerZone>
                    <CacheSettingsSection />
                  </DangerZone>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ageLabel(createdAt: string | null): string {
  const days = backupAgeDays(createdAt);
  if (days === null) return "Never";
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  return `${Math.floor(days)} days ago`;
}

/**
 * The library at a glance, above the sections: what needs attention and how
 * big it is, each card jumping to the section that deals with it. The page
 * used to be five sections in a stack, so a problem could sit at the bottom.
 */
function LibraryStatus({ onJump }: { onJump: (entry: { tab: TabId; anchor: string }) => void }) {
  const { data } = useLibraryStats();
  if (!data) return <div className="skeleton h-20 rounded-lg" />;
  const stale = isBackupStale(data.lastBackup);
  const cards: {
    label: string;
    value: string;
    icon: LucideIcon;
    warn: boolean;
    anchor: { tab: TabId; anchor: string };
  }[] = [
    {
      label: "Missing",
      value: data.videoMissing ? data.videoMissing.toLocaleString() : "None",
      icon: data.videoMissing ? TriangleAlert : CheckCircle2,
      warn: data.videoMissing > 0,
      anchor: { tab: "library", anchor: "library-health-title" },
    },
    {
      label: "Duplicates",
      value: data.videoDuplicateGroups ? data.videoDuplicateGroups.toLocaleString() : "None",
      icon: Copy,
      warn: data.videoDuplicateGroups > 0,
      anchor: { tab: "library", anchor: settingsAnchor("Duplicates") },
    },
    {
      label: "Space used",
      value: formatBytes(data.totalBytes),
      icon: HardDrive,
      warn: false,
      anchor: { tab: "library", anchor: settingsAnchor("Storage") },
    },
    {
      label: "Last backup",
      value: ageLabel(data.lastBackup),
      icon: stale ? ShieldAlert : CheckCircle2,
      warn: stale,
      anchor: { tab: "server", anchor: settingsAnchor("Backup") },
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, warn, anchor }) => (
        <button
          key={label}
          type="button"
          onClick={() => onJump(anchor)}
          className={cn(
            "rounded-lg border bg-card/40 p-3 text-left transition-colors hover:bg-accent",
            warn ? "border-amber-500/40" : "border-border",
          )}
        >
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Icon className={cn("size-3.5", warn ? "text-amber-500" : "text-emerald-500")} />
            {label}
          </span>
          <span className="mt-1 block text-lg font-semibold tabular-nums">{value}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * A section that has nothing to report shrinks to one line, so the ones that
 * do stand out. Expanding it shows the full section, for the occasional
 * deliberate check.
 */
function QuietWhenClear({ children }: { children: React.ReactNode }) {
  const { data } = useLibraryStats();
  const [shown, setShown] = useState(false);
  if (shown || !data || data.videoDuplicateGroups > 0) return <>{children}</>;
  return (
    <button
      type="button"
      id={settingsAnchor("Duplicates")}
      onClick={() => setShown(true)}
      className="flex w-full scroll-mt-24 items-center gap-2 rounded-lg border border-border bg-card/40 px-5 py-3 text-left text-sm transition-colors hover:bg-accent"
    >
      <CheckCircle2 className="size-4 text-emerald-500" />
      <span className="font-medium">Duplicates</span>
      <span className="flex-1 text-muted-foreground">None found</span>
      <span className="text-xs text-muted-foreground">Check again</span>
    </button>
  );
}

/**
 * Where the actions that can't be undone live: below everything else, under
 * a heading that says so. Hidden entirely when the section inside it has
 * nothing to offer (the leftover cleanup hides itself when there is none).
 */
function DangerZone({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden space-y-3 pt-4 has-[section]:block">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-destructive/80">Danger zone</h2>
      <div className="rounded-lg ring-1 ring-destructive/30">{children}</div>
    </div>
  );
}
