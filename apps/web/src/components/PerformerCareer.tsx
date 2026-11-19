import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { ageLabel, careerSummary, careerYears, type CareerItem } from "@/lib/career";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

async function fetchCareer(id: number): Promise<{ birthdate: string | null; items: CareerItem[] }> {
  const res = await fetch(`/api/performers/${id}/career`);
  if (!res.ok) throw new Error(`Failed to load the career: ${res.status}`);
  return res.json();
}

/**
 * A performer's videos laid out by release year, with how old they were each
 * year — their career at a glance, rather than a grid sorted one way.
 *
 * Folded away by default behind its one-line summary: the grid below is
 * still how most visits go, and a performer with eighty videos makes a long
 * timeline.
 */
export function PerformerCareer({
  performerId,
  onSelect,
}: {
  performerId: number;
  onSelect: (id: number, autoPlay: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: qk.performerCareer.detail(performerId),
    queryFn: () => fetchCareer(performerId),
  });
  const years = useMemo(() => careerYears(data?.items ?? []), [data]);
  const summary = useMemo(() => careerSummary(years), [years]);

  // Nothing to lay out without at least one dated video.
  if (!data || summary.first === null) return null;

  const parts = [
    summary.first === summary.last ? `${summary.first}` : `${summary.first}–${summary.last}`,
    summary.firstAge !== null && summary.lastAge !== null
      ? summary.firstAge === summary.lastAge
        ? `age ${summary.firstAge}`
        : `age ${summary.firstAge} to ${summary.lastAge}`
      : null,
    `${summary.activeYears} active year${summary.activeYears === 1 ? "" : "s"}`,
    summary.busiest && summary.activeYears > 1
      ? `busiest ${summary.busiest.year} (${summary.busiest.count})`
      : null,
  ].filter(Boolean);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="group flex w-full items-baseline gap-2 text-left"
      >
        <ChevronRight
          className={cn("size-3.5 self-center text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground group-hover:text-foreground">
          Career
        </h2>
        <span className="truncate text-sm text-muted-foreground">{parts.join(" · ")}</span>
      </button>

      {open && (
        <ol className="relative ml-1.5 space-y-5 border-l border-border pl-5">
          {years.map((group, index) => {
            const previous = years[index - 1]?.year;
            const gap =
              group.year !== null && previous !== null && previous !== undefined
                ? group.year - previous - 1
                : 0;
            return (
              <li key={group.year ?? "undated"} className="relative">
                {gap > 0 && (
                  <p className="-mt-1 mb-4 text-xs italic text-muted-foreground/70">
                    {gap === 1 ? "a year" : `${gap} years`} with nothing released
                  </p>
                )}
                <span
                  aria-hidden
                  className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-background bg-muted-foreground"
                />
                <div className="mb-2 flex items-baseline gap-3">
                  <span className="text-lg font-bold tabular-nums">{group.year ?? "Undated"}</span>
                  {ageLabel(group.ages) && (
                    <span className="text-sm text-muted-foreground">{ageLabel(group.ages)}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {group.items.length} video{group.items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item.id, false)}
                      title={item.title}
                      className="group/tile relative w-40 shrink-0 overflow-hidden rounded-md bg-secondary text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <img
                        src={thumbnailUrl(item)}
                        alt=""
                        loading="lazy"
                        className="sensitive aspect-video w-full object-cover transition-transform duration-200 group-hover/tile:scale-[1.04]"
                      />
                      {item.watched && (
                        <CheckCircle2 className="absolute right-1 top-1 size-4 rounded-full bg-black/60 text-emerald-400" />
                      )}
                      <span className="sensitive block truncate px-1.5 py-1 text-xs">
                        {item.title}
                        {item.ageAtRelease !== null && group.ages && group.ages[0] !== group.ages[1] && (
                          <span className="text-muted-foreground"> · {item.ageAtRelease}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
