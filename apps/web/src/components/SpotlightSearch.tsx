import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Aperture,
  Bookmark,
  Clapperboard,
  Clock,
  EyeOff,
  Focus,
  Heart,
  Home,
  Library,
  Palette,
  Play,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal } from "./Portal";
import { useAppearance } from "@/lib/appearance";
import { requestDiscreetOff } from "@/lib/appEvents";
import { followScan, startScan } from "@/lib/scanApi";
import { useToast } from "@/lib/toast";
import { useQueryClient } from "@tanstack/react-query";
import { SurpriseMe } from "./SurpriseMe";
import { readRecentSearches, recordRecentSearch } from "@/lib/recentSearches";
import {
  GROUP_LABEL,
  ItemRowContent,
  PerformerRowContent,
  rowTarget,
  useSuggestionRows,
  type Row,
} from "./searchRows";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { qk } from "@/lib/queryKeys";
import { useIsOwner } from "@/lib/profile";

/**
 * Search from anywhere, Spotlight-style.
 *
 * The header field already does live suggestions, but it's a small box at the
 * top of the page you have to aim at. This is the same search with the
 * keyboard as the way in and the results given room — the two share their
 * fetching and row rendering, so a match looks the same in both.
 */
/**
 * Opens the palette from elsewhere — the header button.
 *
 * An event rather than lifted state: this component is mounted once in the
 * shell and the button lives in the header, so sharing a boolean would mean a
 * context provider wrapping the whole app to carry it.
 */
const OPEN_EVENT = "media-server:open-search";
const PLAY_EVENT = "media-server:play-item";

export function openSpotlight(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type CommandItem = {
  id: string;
  label: string;
  group: "Actions" | "Navigate";
  shortcut?: string;
  icon: LucideIcon;
  run: () => void;
};

export function SpotlightSearch() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [active, setActive] = useState(0);
  const [surprise, setSurprise] = useState(false);
  const [recents, setRecents] = useState<string[]>(readRecentSearches);
  const navigate = useNavigate();
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);
  const appearance = useAppearance();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Scanning is library management: the owner profile's.
  const isOwner = useIsOwner();
  const commands = useMemo<CommandItem[]>(
    () => ([
      {
        id: "resume",
        label: "Resume last video",
        group: "Actions",
        shortcut: "R",
        icon: Play,
        run: async () => {
          const response = await fetch("/api/continue-watching");
          const data = (await response.json()) as { items?: { id: number }[] };
          const id = data.items?.[0]?.id;
          if (id) {
            window.dispatchEvent(
              new CustomEvent(PLAY_EVENT, { detail: { id, resume: true } }),
            );
          }
        },
      },
      {
        id: "surprise",
        label: "Surprise me",
        group: "Actions",
        shortcut: "S",
        icon: Sparkles,
        // Opens the constrained picker rather than navigating. A blind jump
        // into an unfiltered library is the version §7 explicitly rules out.
        run: () => setSurprise(true),
      },
      {
        id: "favorites",
        label: "Open favorites",
        icon: Heart,
        group: "Actions",
        run: () =>
          void navigate({ to: "/browse", search: { favorite: "true" } }),
      },
      {
        id: "unwatched",
        label: "Open unwatched",
        icon: EyeOff,
        group: "Actions",
        run: () =>
          void navigate({ to: "/browse", search: { watched: "false" } }),
      },
      {
        id: "cinema",
        label: "Toggle cinema mode",
        icon: Clapperboard,
        group: "Actions",
        // Cinema mode belongs to the player, so this is only meaningful with
        // something playing — the modal's own handler ignores it otherwise.
        run: () =>
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "c", bubbles: true }),
          ),
      },
      {
        id: "scan",
        label: "Scan library",
        shortcut: "⇧S",
        icon: RefreshCw,
        group: "Actions",
        // Reported either way: the palette closes as soon as this runs, so a
        // scan that failed to start would otherwise just never happen.
        run: () => {
          void startScan()
            .then(({ id }) => {
              toast({ title: "Scan started", variant: "info" });
              void queryClient.invalidateQueries({ queryKey: qk.scanLatest });
              return followScan(queryClient, id);
            })
            .then((job) => {
              if (job?.status === "failed") {
                toast({
                  title: "Scan failed",
                  description: job.error ?? undefined,
                  variant: "error",
                });
              }
            })
            .catch((error: unknown) =>
              toast({
                title: "Couldn’t start a scan",
                description: error instanceof Error ? error.message : undefined,
                variant: "error",
              }),
            );
        },
      },
      {
        id: "discreet",
        label: "Toggle discreet mode",
        icon: Shield,
        group: "Actions",
        // On is instant; off goes through the same password or passkey
        // check as the shortcut, rather than being a way around it.
        run: () => {
          if (appearance.discreet) requestDiscreetOff();
          else appearance.set({ discreet: true });
        },
      },
      {
        id: "focus",
        label: "Toggle focus mode",
        shortcut: "⌘F",
        icon: Focus,
        group: "Actions",
        run: () => window.dispatchEvent(new Event("media-server:toggle-focus")),
      },
      {
        id: "appearance",
        label: "Appearance",
        icon: Palette,
        group: "Actions",
        run: () =>
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: ",",
              code: "Comma",
              ctrlKey: true,
              shiftKey: true,
            }),
          ),
      },
      {
        id: "home",
        label: "Home",
        group: "Navigate",
        icon: Home,
        run: () => void navigate({ to: "/" }),
      },
      {
        id: "library",
        label: "Library",
        group: "Navigate",
        icon: Library,
        run: () => void navigate({ to: "/browse", search: {} }),
      },
      {
        id: "performers",
        label: "Performers",
        group: "Navigate",
        icon: Users,
        run: () => void navigate({ to: "/performers" }),
      },
      {
        id: "studios",
        label: "Studios",
        group: "Navigate",
        icon: Aperture,
        run: () => void navigate({ to: "/studios" }),
      },
      {
        id: "collections",
        label: "Collections",
        group: "Navigate",
        icon: Bookmark,
        run: () => void navigate({ to: "/browse", search: {} }),
      },
      {
        id: "settings",
        label: "Settings",
        group: "Navigate",
        icon: Settings,
        run: () => void navigate({ to: "/settings" }),
      },
    ] satisfies CommandItem[]).filter((command) => isOwner || command.id !== "scan"),
    [appearance, navigate, queryClient, toast, isOwner],
  );

  const { rows, ready } = useSuggestionRows(value);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey)
        return;
      if (event.code !== "KeyK") return;
      // Chrome puts its address bar on this too; preventDefault is what stops
      // the omnibox opening over the top of us.
      event.preventDefault();
      setOpen((o) => !o);
    }
    function onOpen() {
      setOpen(true);
    }

    // Capture, so the shortcut fires from inside a text field too.
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  // A fresh query each time it opens: reopening to find something else and
  // being handed the last search is worse than an empty box.
  useEffect(() => {
    if (!open) {
      setValue("");
      setActive(0);
    }
  }, [open]);

  const visibleCommands = value.trim()
    ? commands.filter((command) =>
        command.label.toLowerCase().includes(value.trim().toLowerCase()),
      )
    : commands;
  const entries = value.trim() ? rows : [];
  const totalEntries = visibleCommands.length + entries.length;

  // The highlight is an index into a list that changes as you type, so it has
  // to go back to the top whenever the results do.
  useEffect(() => setActive(0), [rows.length, visibleCommands.length]);

  // Keeps the highlighted row on screen when arrowing past the fold.
  useEffect(() => {
    const node = listRef.current?.children[active];
    node?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function chooseCommand(command: CommandItem) {
    setOpen(false);
    void command.run();
  }

  function choose(row: Row) {
    setOpen(false);
    // Recorded on the way out rather than as you type, so the list holds
    // searches you ran and not every prefix on the way to one.
    setRecents(recordRecentSearch(value));
    void navigate({ to: "/browse", search: rowTarget(row) });
  }

  function runQuery(query: string) {
    setOpen(false);
    setRecents(recordRecentSearch(query));
    void navigate({ to: "/browse", search: { q: query } });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      // Stopped here so closing this doesn't also close a video behind it.
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (totalEntries ? (i + 1) % totalEntries : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) =>
        totalEntries ? (i - 1 + totalEntries) % totalEntries : 0,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      // Falls back to the plain query when nothing is highlighted yet, so
      // typing and hitting Enter always does something.
      const command = visibleCommands[active];
      const row = entries[active - visibleCommands.length];
      if (command) chooseCommand(command);
      else if (row) choose(row);
      else if (value.trim()) runQuery(value.trim());
    }
  }

  // Rendered outside the `!open` guard: choosing "Surprise me" closes the
  // palette, and a dialog nested inside it would be unmounted by the same
  // click that opened it.
  const surpriseDialog = surprise ? (
    <SurpriseMe onClose={() => setSurprise(false)} />
  ) : null;

  if (!open) return surpriseDialog;

  return (
    <>
      {surpriseDialog}
    <Portal>
      <div
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        // Sits above the page but below the discreet-mode prompt: that one is
        // the only way out of a mode, and nothing should cover it.
        className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-[2px]"
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-5 shrink-0 text-muted-foreground" />
            <input
              value={value}
              autoFocus
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search or run a command…"
              className="w-full bg-transparent py-4 text-base outline-none placeholder:text-muted-foreground"
            />
            <kbd className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Esc
            </kbd>
          </div>

          {!value.trim() && recents.length > 0 && (
            <div className="border-b border-border px-1.5 py-2">
              <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Recent searches
              </div>
              {/* Outside the arrow-key list on purpose. These are shortcuts
                  you click, and folding them into the keyboard order would
                  push the commands down the list every time you searched. */}
              <div className="flex flex-wrap gap-1 px-2.5 pt-1">
                {recents.map((query) => (
                  <button
                    key={query}
                    type="button"
                    onClick={() => runQuery(query)}
                    className="flex items-center gap-1.5 rounded-full bg-secondary/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Clock className="size-3" />
                    {query}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(!value.trim() || ready || visibleCommands.length > 0) && (
            <ul ref={listRef} className="max-h-[60vh] overflow-y-auto p-1.5">
              {visibleCommands.map((command, index) => (
                <li key={command.id}>
                  {(index === 0 ||
                    visibleCommands[index - 1]?.group !== command.group) && (
                    <div className="px-2.5 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {command.group}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => chooseCommand(command)}
                    onMouseMove={() => setActive(index)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      active === index ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <command.icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {command.label}
                    </span>
                    {command.shortcut && (
                      <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {command.shortcut}
                      </kbd>
                    )}
                  </button>
                </li>
              ))}
              {entries.map((row, index) => (
                <li key={`${row.kind}-${row.label}-${index}`}>
                  <button
                    type="button"
                    onClick={() => choose(row)}
                    // Highlight follows the pointer as well as the keyboard,
                    // so the two never disagree about what Enter would open.
                    onMouseMove={() =>
                      setActive(visibleCommands.length + index)
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      active === visibleCommands.length + index
                        ? "bg-accent"
                        : "hover:bg-accent/50",
                    )}
                  >
                    {row.kind === "performer" && (
                      <PerformerRowContent performer={row.performer} />
                    )}
                    {row.kind === "item" && <ItemRowContent item={row.item} />}
                    {row.kind === "studio" && (
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {row.label}
                      </span>
                    )}
                    {row.kind === "query" && (
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        Search for “{row.label}”
                      </span>
                    )}
                    {row.kind !== "query" && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground/60">
                        {GROUP_LABEL[row.kind]}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Portal>
    </>
  );
}
