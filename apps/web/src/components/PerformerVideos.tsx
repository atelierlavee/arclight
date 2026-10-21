import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MediaGrid } from "./MediaGrid";
import { MediaRow } from "./MediaRow";
import type { MediaCardItem } from "./MediaCard";
import type { PerformerDetail } from "@/lib/performerApi";
import { SORT_OPTIONS, type SortValue } from "@/lib/filters";
import { readSortPreference, writeSortPreference } from "@/lib/sortPreference";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";

type Grouping = "studio" | "year" | "none";

const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: "studio", label: "Studio" },
  { value: "year", label: "Year" },
  { value: "none", label: "All" },
];

async function fetchItems(params: URLSearchParams): Promise<{ items: MediaCardItem[] }> {
  const res = await fetch(`/api/media-items?${params}`);
  if (!res.ok) throw new Error(`Failed to load videos: ${res.status}`);
  return res.json();
}

/**
 * One group's videos, fetched through the same filters the rest of the app
 * uses — so each section is paginated by the server rather than the whole
 * collection being pulled down and sliced in the browser.
 */
function VideoSection({
  title,
  performer,
  params,
  sort,
  onSelect,
}: {
  title: string;
  performer: string;
  params: Record<string, string>;
  sort: SortValue;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const query = new URLSearchParams({ performer, sort, ...params });
  // `sort` is part of the key, or switching it would show the previous
  // order from cache until the request came back.
  const { data, isLoading } = useQuery({
    queryKey: qk.performerVideos.list(performer, params, sort),
    queryFn: () => fetchItems(query),
  });

  return (
    <MediaRow
      title={title}
      // Larger than a home-page row: on a profile these headings are how the
      // page is structured, not just a label above a strip.
      titleClassName="text-xl font-semibold tracking-tight sm:text-2xl"
      items={data?.items ?? []}
      loading={isLoading}
      onSelectItem={(id) => onSelect(id, false)}
      onPlayItem={(id) => onSelect(id, true)}
      onOpenFolder={() => {}}
    />
  );
}

/**
 * A performer's videos, grouped by whichever dimension you pick.
 *
 * Studio is the default because that is how files are filed. "All" falls back
 * to the plain grid, which keeps its own Sort and Year controls — grouping
 * replaces those views rather than competing with them.
 *
 * The choice is component state rather than a URL parameter: it's a viewing
 * preference, and putting it in the URL would mean threading it through the
 * router's search validation for no real gain.
 */
export function PerformerVideos({
  performer,
  onSelect,
}: {
  performer: PerformerDetail;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const [grouping, setGrouping] = useState<Grouping>("studio");
  // Seeded from the last order chosen on a performer page, falling back to
  // newest-first — the grid's own default, so switching between grouped and
  // All does not reorder the page under you.
  //
  // A lazy initialiser, so storage is read once on mount rather than on every
  // render.
  const [sort, setSort] = useState<SortValue>(() =>
    readSortPreference("performer", "newest"),
  );

  function chooseSort(next: SortValue) {
    setSort(next);
    writeSortPreference("performer", next);
  }

  // A performer with nothing to group by would get a single meaningless
  // section, so offer grouping only where it says something.
  const realStudios = performer.studios.filter((s) => s.name !== null);
  const realYears = performer.years.filter((y) => y.year !== null);
  const canGroup = { studio: realStudios.length > 1, year: realYears.length > 1, none: true };
  const effective: Grouping = canGroup[grouping] ? grouping : "none";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Group by</span>
        {GROUPINGS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setGrouping(option.value)}
            disabled={!canGroup[option.value]}
            aria-pressed={effective === option.value}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs transition-colors",
              effective === option.value
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
              !canGroup[option.value] && "cursor-not-allowed opacity-40 hover:bg-transparent"
            )}
          >
            {option.label}
          </button>
        ))}

        {/* A select rather than the button row above it: twelve sorts would
            wrap onto three lines, where four groupings fit on one. The plain
            grid uses the same list, so the two views offer the same orders. */}
        <label className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort</span>
          <select
            value={sort}
            onChange={(event) => chooseSort(event.target.value as SortValue)}
            className="rounded-md bg-secondary px-2 py-1 text-xs text-foreground outline-none ring-border focus:ring-1"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {effective === "studio" &&
        performer.studios.map((group) => (
          <VideoSection
            key={group.name ?? "__none__"}
            title={group.name ?? "No studio"}
            performer={performer.name}
            // The null bucket needs its own filter, or those videos would be
            // missing from the page entirely.
            params={group.name ? { studio: group.name } : { noStudio: "true" }}
            sort={sort}
            onSelect={onSelect}
          />
        ))}

      {effective === "year" &&
        performer.years.map((group) => (
          <VideoSection
            key={group.year ?? "__none__"}
            title={group.year ? String(group.year) : "No date"}
            performer={performer.name}
            params={group.year ? { year: String(group.year) } : { noYear: "true" }}
            sort={sort}
            onSelect={onSelect}
          />
        ))}

      {effective === "none" && (
        <MediaGrid
          source={{
            type: "library",
            tag: null,
            performer: performer.name,
            studio: null,
            kind: null,
            q: null,
            parentId: null,
          }}
          // Seeded from the control above, so the order carries across when
          // you switch grouping off. The grid's own toolbar can still change
          // it from there.
          sort={sort}
          onOpenFolder={() => {}}
        />
      )}
    </div>
  );
}
