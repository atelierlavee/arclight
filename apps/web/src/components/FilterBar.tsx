import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X } from "lucide-react";
import {
  ADDED_WITHIN_OPTIONS,
  DURATION_OPTIONS,
  RESOLUTION_OPTIONS,
  activeFilterChips,
  type Filters,
} from "@/lib/filters";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";

type NamedRow = { id: number; name: string };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-secondary/70 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Where filters are added (§7).
 *
 * Split from the chips below, because the two do different jobs and now live
 * in different places: this is a control and sits with the other controls in
 * the grid's toolbar, while the chips are state and get a row of their own.
 * Squeezing five chips in beside Sort made both unreadable.
 *
 * The panel stays closed by default, so the page is a grid rather than a
 * cockpit (§28).
 *
 * Every control writes the whole filter object back, rather than patching in
 * place. Filters combine, so changing one must not disturb the others, and
 * an immutable hand-off is the cheapest way to be sure of that.
 */
export function FilterMenu({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const chips = activeFilterChips(filters);

  // Only fetched once the panel is opened. A browse page that never opens it
  // shouldn't pay for two lists it isn't going to show (§31).
  const { data: tagData } = useQuery({
    queryKey: qk.tags,
    queryFn: () => fetchJson<{ tags: NamedRow[] }>("/api/tags"),
    enabled: open,
  });
  const { data: performerData } = useQuery({
    queryKey: qk.performers.all,
    queryFn: () => fetchJson<{ performers: NamedRow[] }>("/api/performers"),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Focus goes back to the button that opened it, or it would land on
      // <body> and the next Tab would start from the top of the page.
      buttonRef.current?.focus();
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggleIn(list: string[], value: string): string[] {
    return list.includes(value)
      ? list.filter((entry) => entry !== value)
      : [...list, value];
  }

  return (
    <div className="relative">
      <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-accent",
              chips.length > 0 && "border-foreground/30",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            Filters
            {chips.length > 0 && (
              <span className="rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">
                {chips.length}
              </span>
            )}
          </button>

          {open && (
            <div
              ref={panelRef}
              role="group"
              aria-label="Filters"
              // Anchored to its right edge: the button sits in the grid's
              // toolbar on the right of the page, and a 26rem panel opening
              // leftward from there would run off the screen.
              className="animate-soft-pop absolute right-0 top-full z-30 mt-2 w-[26rem] max-w-[calc(100vw-3rem)] space-y-3.5 rounded-lg border border-border bg-card p-3.5 shadow-2xl"
            >
              <Group label="Watched">
                <Choice
                  active={filters.watched === false}
                  onClick={() =>
                    onChange({
                      ...filters,
                      watched: filters.watched === false ? undefined : false,
                    })
                  }
                >
                  Unwatched
                </Choice>
                <Choice
                  active={filters.watched === true}
                  onClick={() =>
                    onChange({
                      ...filters,
                      watched: filters.watched === true ? undefined : true,
                    })
                  }
                >
                  Watched
                </Choice>
                <Choice
                  active={filters.favorite === true}
                  onClick={() =>
                    onChange({
                      ...filters,
                      favorite: filters.favorite ? undefined : true,
                    })
                  }
                >
                  Favourites
                </Choice>
              </Group>

              <Group label="Rating">
                {[5, 4, 3, 2].map((stars) => (
                  <Choice
                    key={stars}
                    active={filters.minRating === stars}
                    onClick={() =>
                      onChange({
                        ...filters,
                        minRating: filters.minRating === stars ? undefined : stars,
                      })
                    }
                  >
                    {stars === 5 ? "★ 5" : `★ ${stars}+`}
                  </Choice>
                ))}
              </Group>

              <Group label="Duration">
                {DURATION_OPTIONS.map((option) => {
                  const active =
                    filters.minDuration === option.min &&
                    filters.maxDuration === option.max;
                  return (
                    <Choice
                      key={option.value}
                      active={active}
                      onClick={() =>
                        onChange({
                          ...filters,
                          minDuration: active ? undefined : option.min,
                          maxDuration: active ? undefined : option.max,
                        })
                      }
                    >
                      {option.label}
                    </Choice>
                  );
                })}
              </Group>

              <Group label="Resolution">
                {RESOLUTION_OPTIONS.map((option) => (
                  <Choice
                    key={option.value}
                    active={filters.resolution === option.value}
                    onClick={() =>
                      onChange({
                        ...filters,
                        resolution:
                          filters.resolution === option.value
                            ? undefined
                            : option.value,
                      })
                    }
                  >
                    {option.label}
                  </Choice>
                ))}
              </Group>

              <Group label="Added">
                {ADDED_WITHIN_OPTIONS.map((option) => (
                  <Choice
                    key={option.value}
                    active={filters.addedWithin === option.value}
                    onClick={() =>
                      onChange({
                        ...filters,
                        addedWithin:
                          filters.addedWithin === option.value
                            ? undefined
                            : option.value,
                      })
                    }
                  >
                    {option.label}
                  </Choice>
                ))}
              </Group>

              {(tagData?.tags.length ?? 0) > 0 && (
                <Group label="Tags">
                  {/* Capped rather than scrolled: a library with hundreds of
                      tags would make this panel the whole page, and the
                      command palette is the right surface for finding a tag
                      by name. */}
                  {tagData?.tags.slice(0, 24).map((tag) => (
                    <Choice
                      key={tag.id}
                      active={filters.tags.includes(tag.name)}
                      onClick={() =>
                        onChange({
                          ...filters,
                          tags: toggleIn(filters.tags, tag.name),
                        })
                      }
                    >
                      {tag.name}
                    </Choice>
                  ))}
                </Group>
              )}

              {(performerData?.performers.length ?? 0) > 0 && (
                <Group label="Performers">
                  {performerData?.performers.slice(0, 24).map((performer) => (
                    <Choice
                      key={performer.id}
                      active={filters.performers.includes(performer.name)}
                      onClick={() =>
                        onChange({
                          ...filters,
                          performers: toggleIn(
                            filters.performers,
                            performer.name,
                          ),
                        })
                      }
                    >
                      {performer.name}
                    </Choice>
                  ))}
                </Group>
              )}
            </div>
          )}
    </div>
  );
}

/**
 * The filters currently applied, each removable (§7).
 *
 * "Show active filters" and "never silently reset filters" are the same
 * requirement seen from two sides: a filter that is applied but has no chip
 * is one the user can neither see nor turn off. Derived from the filter
 * object rather than tracked separately, which is what guarantees the two
 * agree.
 *
 * Renders nothing at all when nothing is filtered, so an unfiltered page
 * carries no empty bar.
 */
export function FilterChips({
  filters,
  onChange,
  onClear,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  onClear: () => void;
}) {
  const chips = activeFilterChips(filters);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.label}
          type="button"
          onClick={() => onChange(chip.without)}
          aria-label={`Remove filter ${chip.label}`}
          className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs transition-colors hover:bg-accent"
        >
          {chip.label}
          <X className="size-3" />
        </button>
      ))}

      {/* With one filter applied the chip's own × already clears it, so a
          second control beside it would be two buttons doing one job. */}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
