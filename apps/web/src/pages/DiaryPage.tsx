import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Droplets, Star } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { MediaDetailModal } from "@/components/MediaDetailModal";
import { fetchInsights } from "@/lib/insightsApi";
import { formatWatchTime, localDay } from "@/lib/insights";
import { diaryMonth, diaryMonths, finishedOn } from "@/lib/diary";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

const routeApi = getRouteApi("/diary");

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/**
 * The watch log as a diary: month by month, day by day, what you watched and
 * for how long, with your stars, counts and notes beside each.
 *
 * The stats page answers "how much"; this answers "what, and when" — the
 * same hour buckets, read as a history rather than totals.
 */
export function DiaryPage() {
  const { at: monthParam } = routeApi.useSearch();
  const navigate = useNavigate();
  const [open, setOpen] = useState<number | null>(null);
  const { data, isLoading } = useQuery({ queryKey: qk.insights, queryFn: fetchInsights });

  const months = useMemo(() => (data ? diaryMonths(data) : []), [data]);
  const current = localDay(new Date()).slice(0, 7);
  // Without one in the URL, the latest month that has anything in it.
  const month = monthParam ?? months[0] ?? current;
  const days = useMemo(() => (data ? diaryMonth(data, month) : []), [data, month]);
  const performers = useMemo(
    () => new Map((data?.performers ?? []).map((performer) => [performer.id, performer.name])),
    [data],
  );

  const index = months.indexOf(month);
  const older = index === -1 ? months.find((m) => m < month) : months[index + 1];
  const newer = index === -1 ? [...months].reverse().find((m) => m > month) : months[index - 1];
  const monthSeconds = days.reduce((sum, day) => sum + day.seconds, 0);

  function goTo(next: string | undefined) {
    if (next) void navigate({ to: "/diary", search: { at: next } });
  }

  return (
    <AppShell
      title="Diary"
      subtitle="What you watched, day by day."
      actions={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goTo(older)}
            disabled={!older}
            aria-label="Earlier month"
            className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-36 text-center text-sm font-medium">{monthLabel(month)}</span>
          <button
            type="button"
            onClick={() => goTo(newer)}
            disabled={!newer}
            aria-label="Later month"
            className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-accent disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 md:px-6 md:py-8">
        {isLoading && <div className="skeleton h-40 rounded-lg" />}

        {data && days.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
            <BookOpen className="size-8 text-muted-foreground/50" />
            {months.length === 0
              ? "Nothing in the diary yet. It fills in as you watch."
              : `Nothing watched in ${monthLabel(month)}.`}
          </div>
        )}

        {days.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {formatWatchTime(monthSeconds)} over {days.length} day{days.length === 1 ? "" : "s"}
          </p>
        )}

        {days.map((day) => (
          <section key={day.day} className="space-y-2">
            <header className="flex items-baseline gap-3 border-b border-border pb-1.5">
              <h2 className="text-sm font-semibold">{dayLabel(day.day)}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{formatWatchTime(day.seconds)}</span>
              {day.oCount > 0 && (
                <span className="flex items-center gap-0.5 text-xs tabular-nums text-muted-foreground">
                  <Droplets className="size-3" />
                  {day.oCount}
                </span>
              )}
            </header>
            <ul className="space-y-1">
              {day.entries.map(({ item, seconds, oCount }) => {
                const names = item.performerIds
                  .map((id) => performers.get(id))
                  .filter((name): name is string => Boolean(name));
                const finished = finishedOn(item, day.day);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(item.id)}
                      className="flex w-full items-start gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-accent"
                    >
                      <img
                        src={thumbnailUrl(item)}
                        alt=""
                        loading="lazy"
                        className="sensitive aspect-video w-28 shrink-0 rounded object-cover"
                      />
                      <span className="min-w-0 flex-1 space-y-0.5">
                        <span className="sensitive block truncate text-sm font-medium">{item.title}</span>
                        <span className="sensitive block truncate text-xs text-muted-foreground">
                          {[names.join(", "), item.studio].filter(Boolean).join(" · ")}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="tabular-nums">{formatWatchTime(seconds)}</span>
                          {finished && (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="size-3" /> finished
                            </span>
                          )}
                          {oCount > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Droplets className="size-3" /> {oCount}
                            </span>
                          )}
                          {item.rating !== null && (
                            <span className="flex items-center gap-0.5">
                              <Star className="size-3 fill-current text-amber-400" /> {item.rating}
                            </span>
                          )}
                        </span>
                        {item.note && (
                          <span
                            className={cn(
                              "sensitive mt-1 line-clamp-2 border-l-2 border-border pl-2 text-xs italic text-muted-foreground",
                            )}
                          >
                            {item.note}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {open !== null && <MediaDetailModal itemId={open} autoPlay={false} onClose={() => setOpen(null)} />}
    </AppShell>
  );
}
