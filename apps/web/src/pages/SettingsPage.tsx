// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  CornerDownLeft,
  Library,
  Search,
  Server,
  DatabaseBackup,
  Wifi,
  History,
  TriangleAlert,
  User,
  Lock,
  X,
  type LucideIcon,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BackupSettingsSection } from "@/components/BackupSettingsSection";
import { LibraryCleanupSection } from "@/components/LibraryCleanupSection";
import { LibrarySettingsSection } from "@/components/LibrarySettingsSection";
import { LibraryOverview } from "@/components/LibraryOverview";
import { DuplicatesSection } from "@/components/DuplicatesSection";
import { CacheSettingsSection } from "@/components/CacheSettingsSection";
import { NetworkSettingsSection } from "@/components/NetworkSettingsSection";
import { PrivacySettingsSection } from "@/components/PrivacySettingsSection";
import { AccountSettingsSection, PersonalSummary } from "@/components/AccountSettingsSection";
import { AuthenticatorSettingsSection } from "@/components/AuthenticatorSettingsSection";
import { ActivityLogSection } from "@/components/ActivityLogSection";
import { cn } from "@/lib/utils";
import { useIsOwner } from "@/lib/profile";
import { ProfilesSettingsSection } from "@/components/ProfilesSettingsSection";
import { SettingsGroup, settingsInputClass } from "@/components/SettingsSection";
import { settingsAnchor } from "@/lib/settingsAnchor";
import { useLibraryStats } from "@/lib/statsApi";
import { isBackupStale } from "@/lib/backupApi";

const routeApi = getRouteApi("/settings");

/**
 * Two groups: your own settings, which every profile has, then the library
 * and the server, which only the owner manages. Each page names what it is
 * for in the rail and again in its header, so the rail can be read as a map
 * of the whole page without opening anything.
 */
const TABS = [
  {
    id: "personal",
    label: "Personal",
    icon: Lock,
    group: "you",
    description: "Who you are, how you sign in, what keeps discreet mode locked, and who else uses Arc Light on this server.",
  },
  {
    id: "library",
    label: "Library",
    icon: Library,
    group: "server",
    description: "Your folders, what's missing or duplicated, and where the space goes.",
  },
  {
    id: "backup",
    label: "Backup & data",
    icon: DatabaseBackup,
    group: "server",
    description: "Copies of everything that can't be rebuilt from your files, and the artwork the server generates.",
  },
  {
    id: "network",
    label: "Network",
    icon: Wifi,
    group: "server",
    description: "Whether other devices on your wifi can open this server.",
  },
  {
    id: "activity",
    label: "Activity",
    icon: History,
    group: "server",
    description: "A history of what happened in your library.",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  icon: LucideIcon;
  group: "you" | "server";
  description: string;
}[];

const GROUPS = [
  { id: "you", label: "You", scope: "Just you — each profile has its own", icon: User },
  { id: "server", label: "Library & server", scope: "Everyone using this server", icon: Server },
] as const;

type TabId = (typeof TABS)[number]["id"];


/** Tabs that were folded into others, so old links still land somewhere. */
const MOVED: Record<string, { tab: TabId; anchor: string }> = {
  privacy: { tab: "personal", anchor: settingsAnchor("Privacy") },
  profiles: { tab: "personal", anchor: settingsAnchor("Profiles") },
  account: { tab: "personal", anchor: settingsAnchor("Your details") },
  storage: { tab: "library", anchor: "library-health-title" },
  server: { tab: "backup", anchor: "settings-page-backup" },
};

/**
 * Every section, with the words someone might look for it by — what it is
 * called, what it does, and the plainer words for the same thing. Searched
 * instead of the rendered page, so a match on a tab you aren't on is found
 * too. Ordered as the tabs are.
 */
const SETTINGS_INDEX: { tab: TabId; title: string; anchor: string; words: string }[] = [
  {
    tab: "personal",
    title: "Privacy",
    anchor: settingsAnchor("Privacy"),
    words: "discreet blur password touch id lock unlock pin hide",
  },
  {
    tab: "personal",
    title: "Your details",
    anchor: settingsAnchor("Your details"),
    words: "account name first last username sign in login password change",
  },
  {
    tab: "personal",
    title: "Authenticator app",
    anchor: settingsAnchor("Authenticator app"),
    words: "forgot password reset recover two factor 2fa totp google authy code phone",
  },
  {
    tab: "personal",
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
    title: "Left over from removed folders",
    anchor: settingsAnchor("Left over from removed folders"),
    words: "cleanup orphaned old data delete danger",
  },
  { tab: "backup", title: "Backup", anchor: settingsAnchor("Backup"), words: "restore export database save" },
  {
    tab: "backup",
    title: "Cache",
    anchor: settingsAnchor("Cache"),
    words: "thumbnails artwork clear regenerate images danger",
  },
  {
    tab: "network",
    title: "Local network access",
    anchor: settingsAnchor("Local network access"),
    words: "wifi phone tablet lan other devices qr",
  },
  { tab: "activity", title: "Activity history", anchor: "activity-title", words: "log history changes audit" },
];

type Tab = (typeof TABS)[number];
type Entry = { tab: TabId; anchor: string };

/** The id of a page's chapter heading on the one long page. */
const chapterId = (tab: TabId) => `settings-page-${tab}`;

/** How far below the top of the window a chapter counts as the one you're in. */
const SPY_OFFSET = 140;

export function SettingsPage() {
  const { tab } = routeApi.useSearch();
  const isOwner = useIsOwner();
  // The library and the server are the owner profile's; anyone else gets
  // only their own group.
  const tabs: Tab[] = TABS.filter((t) => isOwner || t.group === "you");
  const moved = tab ? MOVED[tab] : undefined;
  const linked = tabs.find((t) => t.id === (moved?.tab ?? tab));

  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // A link to a page (?tab=…) still lands on it: on its chapter, or on the
  // section an old tab moved into.
  const [target, setTarget] = useState<string | null>(
    moved?.anchor ?? (linked ? chapterId(linked.id) : null),
  );
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length
    ? SETTINGS_INDEX.filter((entry) => tabs.some((t) => t.id === entry.tab)).filter((entry) => {
        const haystack = `${entry.title} ${entry.words} ${entry.tab}`.toLowerCase();
        return terms.every((term) => haystack.includes(term));
      })
    : [];

  useEffect(() => {
    if (!target) return;
    const go = () => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    const frame = requestAnimationFrame(go);
    // Sections above the target load their data after the first paint and
    // push it down; a second pass lands where it ended up.
    // Cleared only after that, so picking the same place twice still moves.
    const settle = window.setTimeout(() => {
      go();
      setTarget(null);
    }, 600);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
    };
  }, [target]);

  const spied = useScrollSpy(tabs.map((t) => chapterId(t.id)));
  const current = tabs.find((t) => chapterId(t.id) === spied)?.id ?? tabs[0].id;

  function open(entry: Entry) {
    setQuery("");
    setTarget(entry.anchor);
    // Kept in the URL so a reload comes back to the same place.
    void navigate({ to: "/settings", search: { tab: entry.tab }, replace: true });
  }

  return (
    <AppShell title="Settings" subtitle="Your own preferences, and the library's.">
      {/* Phone and tablet: the contents become a sticky strip of pills. */}
      <div className="sticky top-12 z-20 border-b border-border bg-background/85 backdrop-blur md:top-[60px] lg:hidden">
        <div className="scrollbar-hide mx-auto flex max-w-4xl gap-1.5 overflow-x-auto px-4 py-2 md:px-6">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => open({ tab: entry.id, anchor: chapterId(entry.id) })}
              aria-current={current === entry.id ? "true" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors",
                current === entry.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <entry.icon className="size-3.5" />
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 md:px-6">
        <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12 xl:gap-16">
          <div className="min-w-0 max-w-4xl">
            {/* On a wide screen the search sits atop the contents rail
                instead; here, without the rail, it leads the page. */}
            <div className="lg:hidden">
              <SettingsSearch
                query={query}
                onQuery={setQuery}
                onSubmit={() => results[0] && open(results[0])}
                results={terms.length ? results : null}
                tabs={tabs}
                onOpen={open}
              />
            </div>

            {/* Chapters run straight on: the contents rail already says
                which are yours and which are the server's. */}
            <div className="mt-10 lg:mt-0">
              {tabs.map((entry) => (
                <Chapter key={entry.id} entry={entry} onJump={open} />
              ))}
            </div>
          </div>

          <SettingsContents
            tabs={tabs}
            current={current}
            showGroups={isOwner}
            onOpen={open}
            search={
              <SettingsSearch
                variant="rail"
                query={query}
                onQuery={setQuery}
                onSubmit={() => results[0] && open(results[0])}
                results={terms.length ? results : null}
                tabs={tabs}
                onOpen={open}
              />
            }
          />
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Which of the given elements the reader is in: the last one whose top has
 * scrolled past a line a little below the header. Bottoming out picks the
 * last, so a short final chapter can still be the current one.
 */
function useScrollSpy(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(",");
  useEffect(() => {
    const list = key.split(",");
    let frame = 0;
    const measure = () => {
      frame = 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) {
        setActive(list[list.length - 1]);
        return;
      }
      let found = list[0];
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= SPY_OFFSET) found = id;
      }
      setActive(found);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key]);
  return active;
}

/** The sticky table of contents on a wide screen, marking the chapter you're in. */
function SettingsContents({
  tabs,
  current,
  showGroups,
  onOpen,
  search,
}: {
  tabs: Tab[];
  current: TabId;
  showGroups: boolean;
  onOpen: (entry: Entry) => void;
  search: React.ReactNode;
}) {
  return (
    <nav aria-label="Settings contents" className="hidden lg:order-first lg:block">
      <div className="sticky top-[84px]">
        <div className="mb-6">{search}</div>
        <p className="mb-3 pl-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <div className="space-y-4 border-r border-border">
          {GROUPS.map((group) => {
            const items = tabs.filter((t) => t.group === group.id);
            if (!items.length) return null;
            return (
              <div key={group.id}>
                {showGroups && (
                  <p className="mb-1 pl-2.5 pr-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {group.label}
                  </p>
                )}
                <ul>
                  {items.map((entry) => {
                    const on = current === entry.id;
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          onClick={() => onOpen({ tab: entry.id, anchor: chapterId(entry.id) })}
                          aria-current={on ? "true" : undefined}
                          className={cn(
                            "-mr-px flex w-full items-center gap-2 rounded-l-lg border-r-2 py-1.5 pl-2.5 pr-4 text-left text-sm transition-colors duration-200",
                            on
                              ? "border-primary bg-primary/10 font-medium text-primary"
                              : "border-transparent text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground",
                          )}
                        >
                          <entry.icon className="size-3.5 shrink-0" />
                          <span className="flex-1">{entry.label}</span>
                          {entry.group === "server" && <NavAlert tab={entry.id} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="mt-6 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Back to top ↑
        </button>
      </div>
    </nav>
  );
}

/**
 * A dot beside a page that has something waiting — missing files or
 * duplicates in the library, an old backup on the server. Rendered only for
 * the owner's pages, the only ones that can see these numbers.
 */
function NavAlert({ tab }: { tab: TabId }) {
  const { data } = useLibraryStats();
  if (!data) return null;
  const warn =
    tab === "library"
      ? data.videoMissing > 0 || data.videoDuplicateGroups > 0
      : tab === "backup"
        ? isBackupStale(data.lastBackup)
        : false;
  if (!warn) return null;
  return <span role="img" aria-label="Needs attention" className="size-1.5 shrink-0 rounded-full bg-amber-500" />;
}

/** One page's worth of settings, under a heading of its own. */
function Chapter({
  entry,
  onJump,
}: {
  entry: Tab;
  onJump: (entry: Entry) => void;
}) {
  const id = entry.id;
  const isOwner = useIsOwner();
  return (
    // The id sits on the section, not the sticky title: a stuck element
    // reports where it is pinned, not where it sits in the page, which would
    // send jumps and the scroll spy to the wrong place.
    <section
      id={chapterId(id)}
      aria-labelledby={`${chapterId(id)}-title`}
      // A rule where one chapter ends and the next begins: the accent,
      // brightest in the middle and fading out to both edges.
      className={cn(
        "relative scroll-mt-[64px] space-y-6 py-12 first:pt-0 last:pb-0",
        "before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-primary/70 before:to-transparent first:before:hidden",
      )}
    >
      <div>
        {/* The title stays pinned while you're in its chapter, and the next
            one pushes it off as you scroll into that, so the change of
            chapter is visible right where you're reading. */}
        <header className="z-10 -mx-3 flex items-center gap-3 rounded-b-xl px-3 py-3 lg:sticky lg:top-[60px] lg:bg-background/85 lg:backdrop-blur-md">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <entry.icon className="size-[18px]" />
          </span>
          <h2 id={`${chapterId(id)}-title`} className="text-xl font-semibold tracking-tight">
            {entry.label}
          </h2>
        </header>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{entry.description}</p>
      </div>

      {id === "personal" && (
        <SettingsGroup>
          <PersonalSummary />
          <AccountSettingsSection />
          <PrivacySettingsSection />
          {isOwner && <AuthenticatorSettingsSection />}
          <ProfilesSettingsSection />
        </SettingsGroup>
      )}
      {id === "library" && (
        <>
          <LibraryOverview onJump={onJump} />
          <QuietWhenClear>
            <DuplicatesSection />
          </QuietWhenClear>
          <LibrarySettingsSection />
          <DangerZone>
            <LibraryCleanupSection />
          </DangerZone>
        </>
      )}
      {id === "backup" && (
        <SettingsGroup>
          <BackupSettingsSection />
          <CacheSettingsSection />
        </SettingsGroup>
      )}
      {id === "network" && (
        <SettingsGroup>
          <NetworkSettingsSection />
        </SettingsGroup>
      )}
      {id === "activity" && (
        <SettingsGroup layout="stacked">
          <ActivityLogSection />
        </SettingsGroup>
      )}
    </section>
  );
}

/**
 * The search box, with its matches in a list that drops down over the page:
 * everything is already on the page, so a pick just scrolls to it.
 */
function SettingsSearch({
  variant = "page",
  query,
  onQuery,
  onSubmit,
  results,
  tabs,
  onOpen,
}: {
  /** "rail": the compact box atop the contents column, its results dropping wider than it. */
  variant?: "page" | "rail";
  query: string;
  onQuery: (next: string) => void;
  onSubmit: () => void;
  /** Null while there's nothing typed. */
  results: typeof SETTINGS_INDEX | null;
  tabs: Tab[];
  onOpen: (entry: Entry) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    // A form of its own, so a browser never takes this box for the username
    // belonging to a password field elsewhere on the page.
    <form
      role="search"
      autoComplete="off"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="relative z-10"
    >
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={input}
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
        onChange={(event) => onQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onQuery("");
        }}
        placeholder={variant === "rail" ? "Search settings" : "Search settings — try “password”, “tile size” or “backup”"}
        aria-label="Search settings"
        aria-expanded={results !== null}
        aria-controls={`settings-search-results-${variant}`}
        // It draws its own clear button; the browser's would be a second ✕.
        className={cn(
          settingsInputClass,
          "pl-10 pr-10 [&::-webkit-search-cancel-button]:appearance-none",
          variant === "rail" ? "h-9 rounded-lg" : "h-11 rounded-xl",
        )}
      />
      {query && (
        <button
          type="button"
          onClick={() => {
            onQuery("");
            input.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}

      {results && (
        <div
          id={`settings-search-results-${variant}`}
          className={cn(
            "absolute top-full z-30 mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-border bg-popover shadow-2xl shadow-black/50",
            variant === "rail" ? "left-0 w-[26rem]" : "inset-x-0",
          )}
        >
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Nothing in settings matches “{query.trim()}”.
            </p>
          ) : (
            <ul className="py-1.5">
              {results.map((entry, index) => {
                const tab = tabs.find((t) => t.id === entry.tab)!;
                return (
                  <li key={`${entry.tab}:${entry.title}`}>
                    <button
                      type="button"
                      onClick={() => onOpen(entry)}
                      className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent"
                    >
                      <tab.icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{entry.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {tab.label} · {entry.words}
                        </span>
                      </span>
                      {index === 0 ? (
                        <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-label="Enter" />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </form>
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
      className="flex w-full scroll-mt-24 items-center gap-3 rounded-xl border border-border bg-card/40 px-5 py-3.5 text-left text-sm transition-colors hover:bg-accent/60"
    >
      <CheckCircle2 className="size-4 text-emerald-500" />
      <span className="font-medium">Duplicates</span>
      <span className="flex-1 text-muted-foreground">None found</span>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        Check again
        <ChevronDown className="size-3.5" />
      </span>
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
    <div className="hidden space-y-3 pt-6 has-[section]:block">
      <div className="flex items-center gap-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-destructive/90">
          <TriangleAlert className="size-3.5" />
          Danger zone
        </h2>
        <span className="h-px flex-1 bg-destructive/20" />
      </div>
      <div className="rounded-xl ring-1 ring-destructive/30 [&>section]:border-destructive/20">{children}</div>
    </div>
  );
}
