import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import type { MediaCardItem } from "./MediaCard";
import { fetchSettings, saveHeroSettings, type HeroSource } from "@/lib/settingsApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";
import { SettingsSection } from "./SettingsSection";
import { qk } from "@/lib/queryKeys";

const SOURCES: { value: HeroSource; label: string; hint: string }[] = [
  { value: "manual", label: "Videos I pick", hint: "Only the ones you choose below, in this order." },
  { value: "favorites", label: "My favourites", hint: "Anything you've marked with the heart." },
  { value: "recent", label: "Recently added", hint: "The five newest videos in the library." },
];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export function HeroSettingsSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: qk.settings, queryFn: fetchSettings });

  const [source, setSource] = useState<HeroSource>("recent");
  const [itemIds, setItemIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState(false);
  // Index being dragged, and the slot it would land in. Both live in state
  // rather than a ref because the insertion marker has to re-render as the
  // pointer moves between tiles.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  /** Moves one pick to a new slot, keeping every other pick's relative order. */
  function reorder(from: number, to: number) {
    if (from === to) return;
    setItemIds((ids) => {
      const next = [...ids];
      const [moved] = next.splice(from, 1);
      // Splicing out first shifts everything after `from` down by one, so a
      // rightward move would land one slot short without this adjustment.
      next.splice(to > from ? to - 1 : to, 0, moved);
      return next;
    });
    setSaved(false);
  }

  useEffect(() => {
    if (!settings) return;
    setSource(settings.hero.source);
    setItemIds(settings.hero.itemIds);
  }, [settings]);

  // One list request covers both the chosen titles and the pool to pick from
  // — a personal library sits well inside a single page.
  const { data: allItems } = useQuery({
    queryKey: qk.mediaItems.heroPicker,
    queryFn: () => fetchJson<{ items: MediaCardItem[] }>("/api/media-items?type=video"),
  });

  const byId = new Map((allItems?.items ?? []).map((i) => [i.id, i]));
  const chosen = itemIds.map((id) => byId.get(id)).filter((i): i is MediaCardItem => !!i);

  const term = search.trim().toLowerCase();
  const results = (allItems?.items ?? [])
    .filter((i) => !itemIds.includes(i.id))
    .filter((i) => (term ? i.title.toLowerCase().includes(term) : true))
    .slice(0, 9);

  const save = useMutation({
    mutationFn: () => saveHeroSettings({ source, itemIds }),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: qk.settings });
      queryClient.invalidateQueries({ queryKey: qk.heroItems });
    },
  });

  const dirty =
    settings !== undefined &&
    (source !== settings.hero.source ||
      JSON.stringify(itemIds) !== JSON.stringify(settings.hero.itemIds));

  return (
    <SettingsSection
      title="Hero slider"
      description="Which videos rotate through the banner at the top of the home page."
    >

      <div className="space-y-2">
        {SOURCES.map((option) => (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
              source === option.value
                ? "border-white/40 bg-secondary"
                : "border-border hover:bg-accent/50"
            )}
          >
            <input
              type="radio"
              name="hero-source"
              checked={source === option.value}
              onChange={() => {
                setSource(option.value);
                setSaved(false);
              }}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="block text-xs text-muted-foreground">{option.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {source === "manual" && (
        <div className="space-y-3 rounded-md border border-border p-3">
          {chosen.length > 0 ? (
            // Scrolls sideways rather than wrapping, so adding a tenth pick
            // extends the row instead of pushing the search box further down
            // the card each time.
            <ul className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
              {chosen.map((item, index) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox refuses to start a drag unless some data is set.
                    e.dataTransfer.setData("text/plain", String(item.id));
                  }}
                  onDragOver={(e) => {
                    if (dragIndex === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    // Drop before or after this tile depending on which half
                    // the pointer is over, so the last tile can be dragged to
                    // the very front — the leftmost slot is otherwise
                    // unreachable, since there's no tile to its left.
                    const box = e.currentTarget.getBoundingClientRect();
                    const after = e.clientX > box.left + box.width / 2;
                    setOverIndex(after ? index + 1 : index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && overIndex !== null) reorder(dragIndex, overIndex);
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  // Wider than the suggestions below: these are the actual
                  // setting, not a pool to skim, and the size difference says
                  // which row is which without a label.
                  className={cn(
                    "group relative w-48 shrink-0 cursor-grab snap-start active:cursor-grabbing",
                    dragIndex === index && "opacity-40"
                  )}
                  title={item.title}
                >
                  {/* Insertion marker: a bar in the gap the tile would land
                      in, rather than highlighting the tile being hovered,
                      which never says which side of it you'd end up on. */}
                  {dragIndex !== null && overIndex === index && (
                    <span className="absolute -left-1 top-0 z-10 h-full w-0.5 rounded bg-white" />
                  )}
                  {dragIndex !== null && overIndex === index + 1 && (
                    <span className="absolute -right-1 top-0 z-10 h-full w-0.5 rounded bg-white" />
                  )}
                  <div className="overflow-hidden rounded ring-1 ring-border">
                    <img
                      src={thumbnailUrl(item)}
                      alt=""
                      // Without this the browser drags the image itself and
                      // the list's own drag never starts.
                      draggable={false}
                      className="aspect-video w-full object-cover"
                    />
                  </div>
                  {/* The order still matters — it's the rotation order — and a
                      grid can't show it by position alone the way a numbered
                      list did, so each tile carries its place. */}
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/75 px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setItemIds(itemIds.filter((id) => id !== item.id));
                      setSaved(false);
                    }}
                    aria-label={`Remove ${item.title} from the hero`}
                    className="absolute right-1.5 top-1.5 rounded bg-black/75 p-1.5 text-white transition-colors hover:bg-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Nothing picked yet — the hero stays hidden until you add something.
            </p>
          )}

          {chosen.length > 1 && (
            <p className="text-[11px] text-muted-foreground/70">
              Drag a tile to reorder — number 1 shows first.
            </p>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search videos to add…"
              className="w-full rounded-md border border-border bg-secondary/60 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-ring/60"
            />
          </div>

          {results.length > 0 && (
            // A single scrolling row rather than a block of nine: the
            // suggestions are a transient pool to skim, and giving them three
            // rows of vertical space made them read as the main content of
            // the card instead of the picks above them.
            <ul className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1">
              {results.map((item) => (
                <li key={item.id} className="w-28 shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => {
                      setItemIds([...itemIds, item.id]);
                      setSearch("");
                      setSaved(false);
                    }}
                    title={item.title}
                    aria-label={`Add ${item.title} to the hero`}
                    className="group w-full text-left"
                  >
                    <div className="relative overflow-hidden rounded ring-1 ring-border transition-colors group-hover:ring-white/40">
                      <img
                        src={thumbnailUrl(item)}
                        alt=""
                        className="aspect-video w-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                        <Plus className="size-5 text-white" />
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {saved && !dirty && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Check className="size-3.5" />
          Saved
        </p>
      )}

      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={!dirty || save.isPending}
        className="flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
      >
        {save.isPending && <Loader2 className="size-4 animate-spin" />}
        Save hero
      </button>
    </SettingsSection>
  );
}
