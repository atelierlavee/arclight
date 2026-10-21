import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { qk } from "@/lib/queryKeys";

type TimelineMonth = { year: number; month: number; total: number };

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

async function fetchTimeline(): Promise<{ months: TimelineMonth[] }> {
  const res = await fetch("/api/timeline");
  if (!res.ok) throw new Error(`Failed to load timeline: ${res.status}`);
  return res.json();
}

/**
 * Year and month navigation for a large chronological library (§14).
 *
 * Collapsed to years by default, expanding one year into its months. A flat
 * list of every month a library covers is hundreds of rows of mostly-empty
 * buckets; the years are the scale you actually navigate at, and the months
 * are the detail you want once you have picked one.
 *
 * Counts are shown on every row because they are what makes the thing
 * navigable — a year with four items and a year with four hundred should not
 * look the same when you are deciding where to click.
 *
 * Hidden entirely when the library has no release dates to plot. A timeline
 * of nothing is a control that teaches you the feature is broken.
 */
export function Timeline({
  year,
  month,
  onSelect,
}: {
  year?: number;
  month?: number;
  /** Passing undefined for both clears the period filter. */
  onSelect: (period: { year?: number; month?: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expandedYear, setExpandedYear] = useState<number | null>(year ?? null);

  const { data } = useQuery({
    queryKey: qk.timeline,
    queryFn: fetchTimeline,
    enabled: open,
  });

  const years = useMemo(() => {
    const byYear = new Map<number, { total: number; months: TimelineMonth[] }>();
    for (const entry of data?.months ?? []) {
      const bucket = byYear.get(entry.year) ?? { total: 0, months: [] };
      bucket.total += entry.total;
      bucket.months.push(entry);
      byYear.set(entry.year, bucket);
    }
    return [...byYear.entries()]
      .map(([value, bucket]) => ({ year: value, ...bucket }))
      .sort((a, b) => b.year - a.year);
  }, [data]);

  const label =
    year === undefined
      ? "Timeline"
      : month === undefined
        ? String(year)
        : `${MONTH_LABELS[month - 1]} ${year}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-accent",
          year !== undefined && "border-foreground/30",
        )}
      >
        <CalendarRange className="size-3.5" />
        {label}
        <ChevronDown className="size-3" />
      </button>

      {open && (
        <div className="animate-soft-pop absolute left-0 top-full z-30 mt-2 max-h-80 w-56 overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-2xl">
          {years.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No release dates yet. A scan fills these in from filenames.
            </p>
          ) : (
            <>
              {year !== undefined && (
                <button
                  type="button"
                  onClick={() => {
                    onSelect({});
                    setOpen(false);
                  }}
                  className="mb-1 w-full rounded px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  All years
                </button>
              )}

              {years.map((entry) => (
                <div key={entry.year}>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => {
                        onSelect({ year: entry.year });
                        setExpandedYear(entry.year);
                      }}
                      aria-current={
                        year === entry.year && month === undefined
                          ? "true"
                          : undefined
                      }
                      className={cn(
                        "flex min-w-0 flex-1 items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                        year === entry.year && "font-medium text-foreground",
                      )}
                    >
                      <span>{entry.year}</span>
                      <span className="text-muted-foreground">
                        {entry.total}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedYear(
                          expandedYear === entry.year ? null : entry.year,
                        )
                      }
                      aria-label={
                        expandedYear === entry.year
                          ? `Collapse ${entry.year}`
                          : `Show months in ${entry.year}`
                      }
                      aria-expanded={expandedYear === entry.year}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <ChevronDown
                        className={cn(
                          "size-3 transition-transform",
                          expandedYear === entry.year && "rotate-180",
                        )}
                      />
                    </button>
                  </div>

                  {expandedYear === entry.year && (
                    <div className="mb-1 ml-2 border-l border-border pl-1.5">
                      {entry.months
                        .slice()
                        .sort((a, b) => a.month - b.month)
                        .map((entryMonth) => (
                          <button
                            key={entryMonth.month}
                            type="button"
                            onClick={() => {
                              onSelect({
                                year: entry.year,
                                month: entryMonth.month,
                              });
                              setOpen(false);
                            }}
                            aria-current={
                              year === entry.year && month === entryMonth.month
                                ? "true"
                                : undefined
                            }
                            className={cn(
                              "flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs transition-colors hover:bg-accent",
                              year === entry.year &&
                                month === entryMonth.month &&
                                "font-medium text-foreground",
                            )}
                          >
                            <span className="text-muted-foreground">
                              {MONTH_LABELS[entryMonth.month - 1]}
                            </span>
                            <span className="text-muted-foreground">
                              {entryMonth.total}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
