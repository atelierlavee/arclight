// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Settings,
  Bookmark,
  FolderOpen,
  Home,
  Inbox,
  Lock,
  Images,
  Layers,
  CheckCircle2,
  ChevronDown,
  TriangleAlert,
  Pin,
  Plus,
  Tv,
  Tag,
  Trash2,
  Users,
  X,
  Rss,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo, BrandMark } from "./BrandLogo";
import { CreateCollectionModal } from "./CreateCollectionModal";
import {
  isPinned,
  pinsChangedEvent,
  readPins,
  removePin,
  togglePin,
  type Pin as PinnedItem,
} from "@/lib/pinned";
import { useLibraryStats } from "@/lib/statsApi";
import {
  isMediaDrag,
  readMediaDragData,
  type MediaDragPayload,
} from "@/lib/dragMedia";
import {
  addItemsToCollection,
  removeItemsFromCollection,
} from "@/lib/bulkActions";
import { useUndoable } from "@/lib/undo";
import {
  readSavedSearches,
  removeSavedSearch,
  savedSearchesChangedEvent,
} from "@/lib/savedSearches";
import { qk } from "@/lib/queryKeys";
import { useIsOwner } from "@/lib/profile";

type Collection = { id: number; name: string; type: "manual" | "smart" };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

/** The ways into the library besides Browse, folded under it in the sidebar. */
const LIBRARY_LINKS = [
  { to: "/albums", label: "Albums", icon: Images },
  { to: "/series", label: "Series", icon: Tv },
  { to: "/tags", label: "Tags", icon: Tag },
] as const;

/** Per device, like the sidebar's own collapsed state. */
const LIBRARY_OPEN_KEY = "sidebar-library-open";

function readLibraryOpen(): boolean {
  try {
    return localStorage.getItem(LIBRARY_OPEN_KEY) === "true";
  } catch {
    return false;
  }
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </div>
  );
}

function InboxLink({
  collapsed,
  navItemClass,
}: {
  collapsed: boolean;
  navItemClass: string;
}) {
  const { data } = useQuery({
    queryKey: qk.inboxCount,
    queryFn: async () => {
      const res = await fetch("/api/inbox/count");
      if (!res.ok) return { count: 0 };
      return res.json() as Promise<{ count: number }>;
    },
    refetchInterval: 60_000,
  });
  const count = data?.count ?? 0;

  return (
    <Link
      to="/inbox"
      // Relative, so the count badge pins to this row — collapsed, it is
      // positioned absolutely and otherwise flew to the top of the sidebar.
      className={cn(navItemClass, "relative")}
      title={collapsed ? "Inbox" : undefined}
      activeProps={{ className: "bg-accent text-foreground font-medium" }}
    >
      <Inbox className="size-4 shrink-0" />
      {!collapsed && "Inbox"}
      {count > 0 && (
        <span className={cn(
          "ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground",
          collapsed && "absolute right-1 top-0.5",
        )}>
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({
  collapsed,
  mobile = false,
  mobileOpen = false,
  onMobileClose,
}: {
  collapsed: boolean;
  /** Phone width: the sidebar is an off-canvas drawer, not a column. */
  mobile?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [pins, setPins] = useState<PinnedItem[]>(readPins);
  const [saved, setSaved] = useState(readSavedSearches);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpenState] = useState(readLibraryOpen);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const onLibrarySubpage = ["/albums", "/album/", "/series", "/tags"].some((prefix) =>
    pathname.startsWith(prefix),
  );
  const libraryShown = libraryOpen || onLibrarySubpage;
  const onYouPage = ["/stats", "/diary", "/tiers"].includes(pathname);
  function setLibraryOpen(open: boolean) {
    setLibraryOpenState(open);
    try {
      localStorage.setItem(LIBRARY_OPEN_KEY, String(open));
    } catch {
      // Private mode: it just won't be remembered.
    }
  }
  const runUndoable = useUndoable();
  const queryClient = useQueryClient();

  useEffect(() => {
    // "storage" covers another tab; the custom events cover this one, which
    // does not fire "storage" for its own writes.
    const refresh = () => {
      setPins(readPins());
      setSaved(readSavedSearches());
    };
    window.addEventListener(pinsChangedEvent(), refresh);
    window.addEventListener(savedSearchesChangedEvent(), refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(pinsChangedEvent(), refresh);
      window.removeEventListener(savedSearchesChangedEvent(), refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const { data: collections } = useQuery({
    queryKey: qk.collections,
    queryFn: () => fetchJson<{ collections: Collection[] }>("/api/collections"),
  });
  const { data: health } = useLibraryStats();
  const healthIssues = health
    ? health.videoMissing + health.videoDuplicateGroups
    : 0;
  // Names the actual fault where there is one kind of it, so the row says
  // what to expect on the other side of the click.
  const healthLabel = !health
    ? "Library health"
    : health.videoMissing > 0 && health.videoDuplicateGroups > 0
      ? `${healthIssues} library issues`
      : health.videoMissing > 0
        ? `${health.videoMissing} missing`
        : health.videoDuplicateGroups > 0
          ? `${health.videoDuplicateGroups} duplicate${health.videoDuplicateGroups === 1 ? "" : "s"}`
          : "Library healthy";

  /**
   * Adds dropped items to a collection (§13).
   *
   * Reuses the same bulk helper the action bar uses rather than a second
   * path, so a drop and a menu choice cannot end up behaving differently.
   * The toast carries an undo: a drop is the easiest gesture in the app to
   * make by accident.
   */
  async function dropOnCollection(
    payload: MediaDragPayload,
    collection: Collection,
  ) {
    await runUndoable({
      message: `Added to ${collection.name}`,
      description:
        payload.ids.length === 1 ? payload.label : `${payload.ids.length} items`,
      apply: () => addItemsToCollection(payload.ids, collection.id, () => {}),
      revert: async () => {
        await removeItemsFromCollection(payload.ids, collection.id, () => {});
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: qk.collectionItems.all });
        queryClient.invalidateQueries({ queryKey: qk.mediaItems.all });
      },
    });
  }

  // Inbox, library health and collection management are the owner's.
  const isOwner = useIsOwner();
  const deleteCollection = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/collections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete collection");
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: qk.collections }),
  });

  // Collapsed, every row becomes a centred icon with no room for a label.
  const navItemClass = cn(
    "flex items-center rounded-md text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
    // Roomier rows on touch, where the pointer is a fingertip.
    mobile ? "py-2.5" : "py-2",
    collapsed ? "justify-center px-0" : "gap-2.5 px-3",
  );

  return (
    <aside
      // A drawer on phones: taken out of the flow entirely so the content
      // gets the whole viewport, and slid off-screen rather than unmounted so
      // it animates and keeps its scroll position.
      aria-hidden={mobile && !mobileOpen}
      className={cn(
        "cinema-hide focus-hide flex flex-col border-r border-border",
        // Translucent works beside the page; over it, the content behind
        // shows straight through the nav.
        mobile ? "bg-card" : "bg-card/40",
        mobile
          ? cn(
              "fixed inset-y-0 left-0 z-50 h-dvh w-72 max-w-[85vw] shadow-2xl transition-transform duration-200 ease-out",
              mobileOpen ? "translate-x-0" : "-translate-x-full",
            )
          : cn(
              "sticky top-0 h-screen shrink-0 transition-[width] duration-200 ease-out",
              collapsed ? "w-16" : "w-60",
            ),
      )}
    >
      {/* The logo heads the sidebar; the phone drawer adds its close button. */}
      <div
        className={cn(
          "flex h-[72px] shrink-0 items-center",
          collapsed ? "justify-center" : "justify-between px-5",
        )}
      >
        <Link to="/" aria-label="Home">
          {collapsed ? <BrandMark /> : <BrandLogo size="sm" tagline={false} />}
        </Link>
        {mobile && (
          <button
            type="button"
            onClick={onMobileClose}
            aria-label="Close menu"
            title="Close menu"
            className="-mr-1 flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav
        className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4 pt-2"
        // Following a link should dismiss the drawer, including a link back to
        // the page you are already on, which no route change would catch.
        onClick={
          mobile
            ? (event) => {
                if ((event.target as HTMLElement).closest("a")) onMobileClose?.();
              }
            : undefined
        }
      >
        <Link
          to="/"
          className={navItemClass}
          title={collapsed ? "Home" : undefined}
          activeOptions={{ exact: true }}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          <Home className="size-4 shrink-0" />
          {!collapsed && "Home"}
        </Link>
        <Link
          to="/feed"
          className={navItemClass}
          title={collapsed ? "Feed" : undefined}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          <Rss className="size-4 shrink-0" />
          {!collapsed && "Feed"}
        </Link>

        {/* Library is Browse, with the other ways into the same files —
            albums, series, tags — folded under it instead of each taking a
            row of their own. Open while you are on one of them. */}
        <div className="flex items-center">
          <Link
            to="/browse"
            className={cn(navItemClass, "min-w-0 flex-1")}
            title={collapsed ? "Library" : undefined}
            activeProps={{ className: "bg-accent text-foreground font-medium" }}
          >
            <FolderOpen className="size-4 shrink-0" />
            {!collapsed && "Library"}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={() => setLibraryOpen(!libraryShown)}
              aria-expanded={libraryShown}
              aria-label={libraryShown ? "Hide albums, series and tags" : "Show albums, series and tags"}
              className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", !libraryShown && "-rotate-90")} />
            </button>
          )}
        </div>
        {libraryShown && (
          <div className={cn(!collapsed && "ml-4 border-l border-border pl-1.5")}>
            {LIBRARY_LINKS.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={navItemClass}
                title={collapsed ? label : undefined}
                activeProps={{ className: "bg-accent text-foreground font-medium" }}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && label}
              </Link>
            ))}
          </div>
        )}

        <Link
          to="/performers"
          className={navItemClass}
          title={collapsed ? "Performers" : undefined}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          <Users className="size-4 shrink-0" />
          {!collapsed && "Performers"}
        </Link>
        {isOwner && <InboxLink collapsed={collapsed} navItemClass={navItemClass} />}


        {/* Collections are text-only — collapsed they'd be a column of
            identical, unreadable icons, so the list hides entirely. The create
            action stays, since it's the one thing that isn't recoverable by
            just expanding again. */}
        {collapsed ? (
          isOwner && <button
            type="button"
            onClick={() => setShowCreate(true)}
            aria-label="New collection"
            title="New collection"
            className={cn(navItemClass, "mt-4 w-full")}
          >
            <Plus className="size-4 shrink-0" />
          </button>
        ) : (
          <>
            <div className="flex items-center justify-between pr-2">
              <SectionLabel>Collections</SectionLabel>
              {isOwner && <button
                type="button"
                onClick={() => setShowCreate(true)}
                aria-label="New collection"
                className="mt-3 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>}
            </div>
            {collections?.collections.length === 0 && (
              <p className="px-3 text-xs text-muted-foreground/60">None yet</p>
            )}
            {collections?.collections.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center rounded-md",
                  // Only a manual collection is a drop target. A smart one is
                  // a saved query — adding an item to it by hand would either
                  // do nothing or quietly contradict its rule.
                  dropTarget === c.id && "ring-1 ring-foreground/40",
                )}
                onDragOver={(event) => {
                  if (!isOwner || c.type !== "manual" || !isMediaDrag(event.dataTransfer))
                    return;
                  // Both are required: without preventDefault the browser
                  // refuses the drop, and the drop handler never runs.
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                  setDropTarget(c.id);
                }}
                onDragLeave={() =>
                  setDropTarget((current) => (current === c.id ? null : current))
                }
                onDrop={(event) => {
                  if (!isOwner || c.type !== "manual") return;
                  event.preventDefault();
                  setDropTarget(null);
                  const payload = readMediaDragData(event.dataTransfer);
                  if (payload) void dropOnCollection(payload, c);
                }}
              >
                <Link
                  to="/browse"
                  search={{ collectionId: c.id }}
                  className={cn(navItemClass, "flex-1 truncate")}
                  activeProps={{ className: "text-foreground" }}
                >
                  <Layers className="size-4 shrink-0" />
                  <span className="truncate">{c.name}</span>
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    togglePin({
                      id: `collection:${c.id}`,
                      type: "collection",
                      label: c.name,
                      collectionId: c.id,
                    })
                  }
                  aria-label={`${isPinned(`collection:${c.id}`) ? "Unpin" : "Pin"} ${c.name}`}
                  className="hidden rounded p-1 text-muted-foreground hover:text-foreground group-hover:block"
                >
                  <Pin
                    className={cn(
                      "size-3.5",
                      isPinned(`collection:${c.id}`) && "fill-current",
                    )}
                  />
                </button>
                {isOwner && <button
                  type="button"
                  onClick={() => deleteCollection.mutate(c.id)}
                  aria-label={`Delete ${c.name}`}
                  className="hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                >
                  <Trash2 className="size-3.5" />
                </button>}
              </div>
            ))}

            {saved.length > 0 && (
              <>
                <SectionLabel>Saved searches</SectionLabel>
                {saved.map((entry) => (
                  <div key={entry.id} className="group flex items-center">
                    <Link
                      to="/browse"
                      // Parsed back into a search object rather than
                      // navigated to as a raw href: the router owns the
                      // shape of this route's search, and handing it a
                      // string would skip its own validation.
                      search={Object.fromEntries(
                        new URLSearchParams(entry.search),
                      )}
                      className={cn(navItemClass, "min-w-0 flex-1 truncate")}
                      title={entry.name}
                    >
                      <Bookmark className="size-4 shrink-0" />
                      <span className="truncate">{entry.name}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeSavedSearch(entry.id)}
                      aria-label={`Delete saved search ${entry.name}`}
                      className="hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )}

            {pins.length > 0 && (
              <>
                <SectionLabel>Pinned</SectionLabel>
                {pins.map((pin) => (
                  <div key={pin.id} className="group flex items-center">
                    {pin.type === "performer" ? (
                      <Link
                        to="/performer/$performerId"
                        params={{ performerId: String(pin.performerId) }}
                        className={cn(navItemClass, "min-w-0 flex-1 truncate")}
                      >
                        <Pin className="size-4 shrink-0" />{" "}
                        <span className="truncate">{pin.label}</span>
                      </Link>
                    ) : pin.type === "studio" ? (
                      <Link
                        to="/studio/$studioId"
                        params={{ studioId: String(pin.studioId) }}
                        className={cn(navItemClass, "min-w-0 flex-1 truncate")}
                      >
                        <Pin className="size-4 shrink-0" />{" "}
                        <span className="truncate">{pin.label}</span>
                      </Link>
                    ) : (
                      <Link
                        to="/browse"
                        search={
                          pin.type === "collection"
                            ? { collectionId: pin.collectionId }
                            : { parentId: pin.folderId }
                        }
                        className={cn(navItemClass, "min-w-0 flex-1 truncate")}
                      >
                        <Pin className="size-4 shrink-0" />{" "}
                        <span className="truncate">{pin.label}</span>
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => removePin(pin.id)}
                      aria-label={`Unpin ${pin.label}`}
                      className="hidden rounded p-1 text-muted-foreground hover:text-destructive group-hover:block"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </nav>

      <div className="border-t border-border p-2">
        {/* One row, not two. A separate "N missing" entry sat directly above
            this one counting the same problem, so the sidebar reported the
            same fault twice and disagreed with itself about where to go.

            Where it leads follows what is wrong: missing files have a page
            built to act on them, so that is where the row goes when there are
            any. With only duplicates — which have a count but no manager yet —
            the health panel in settings is still the whole story. */}
        {isOwner && <Link
          {...(health && health.videoMissing > 0
            ? { to: "/missing" as const }
            : { to: "/settings" as const, search: { tab: "library" } })}
          title={collapsed ? healthLabel : undefined}
          className={cn(navItemClass, "mb-1")}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          {healthIssues > 0 ? (
            <TriangleAlert className="size-4 shrink-0 text-amber-500" />
          ) : (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
          )}
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate">{healthLabel}</span>
          )}
          {/* The missing page asks for the privacy credential, so the padlock
              says so before you click rather than after. */}
          {!collapsed && health && health.videoMissing > 0 && (
            <Lock className="size-3 shrink-0 text-muted-foreground/60" />
          )}
        </Link>}
        {/* Stats, Diary and Tier list are one place with three tabs, so one
            row — lit on any of the three. The vault is in the account menu. */}
        <Link
          to="/stats"
          className={cn(navItemClass, onYouPage && "bg-accent font-medium text-foreground")}
          title={collapsed ? "You" : undefined}
        >
          <BarChart3 className="size-4 shrink-0" />
          {!collapsed && "Your stats"}
        </Link>
        <Link
          to="/settings"
          className={cn(navItemClass, "mt-1")}
          title={collapsed ? "Settings" : undefined}
          activeProps={{ className: "bg-accent text-foreground font-medium" }}
        >
          <Settings className="size-4 shrink-0" />
          {!collapsed && "Settings"}
        </Link>
      </div>

      {showCreate && (
        <CreateCollectionModal onClose={() => setShowCreate(false)} />
      )}
    </aside>
  );
}
