import { useMemo, useState } from "react";
import { calendarMonths, formatWatchTime, monthRecap, type Insights } from "@/lib/insights";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { cn } from "@/lib/utils";
import { Bars } from "./Bars";
import { lastTwelveMonths, latestMonthWithTime, monthTotals, MONTHS, WEEKDAYS } from "./statsData";

export function YourYear({
  data,
  days,
  today,
  onOpenItem,
}: {
  data: Insights;
  days: Map<string, number>;
  today: string;
  onOpenItem: (id: number) => void;
}) {
  // The last twelve months, oldest first, ending with this one.
  const months = useMemo(() => lastTwelveMonths(), []);
  const totals = monthTotals(months, days);
  const latestWithTime = latestMonthWithTime(totals);
  const [selected, setSelected] = useState(latestWithTime);
  const recap = monthRecap(data, months[selected]);

  return (
    <div className="space-y-12">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
            Hours per month · tap a month for its recap
          </p>
          <Bars
            values={totals}
            labels={months.map((m) => MONTHS[Number(m.slice(5, 7)) - 1])}
            format={(v) => (v > 0 ? formatWatchTime(v) : "nothing")}
            selected={selected}
            onSelect={setSelected}
            height="h-56"
            minScale={3600}
          />
        </div>
        <MonthStory month={months[selected]} recap={recap} onOpenItem={onOpenItem} />
      </div>

      <div>
        <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">Every day, this year</p>
        <DayGrid days={days} today={today} />
      </div>
    </div>
  );
}

/** The month's recap written out as a short story, not a card deck. */
function MonthStory({
  month,
  recap,
  onOpenItem,
}: {
  month: string;
  recap: ReturnType<typeof monthRecap>;
  onOpenItem: (id: number) => void;
}) {
  const name = new Date(`${month}-15T12:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  if (!recap || recap.seconds < 60) {
    return (
      <div className="flex flex-col justify-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">{name}</p>
        <p className="mt-3 text-2xl font-bold text-muted-foreground">A quiet month — nothing watched yet.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Watch a few minutes and this month's story writes itself here: how long, who and which studio.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col justify-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">{name}</p>
      <p className="mt-3 text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
        You watched <span className="text-amber-300">{formatWatchTime(recap.seconds)}</span> across {recap.videos}{" "}
        {recap.videos === 1 ? "video" : "videos"}
        {recap.topPerformer && (
          <>
            , mostly <span className="sensitive text-amber-300">{recap.topPerformer.performer.name}</span>
          </>
        )}
        {recap.topStudio && (
          <>
            {" "}from <span className="text-amber-300">{recap.topStudio.name}</span>
          </>
        )}
        .
      </p>
      <p className="mt-3 text-muted-foreground">
        {recap.activeDays} active {recap.activeDays === 1 ? "day" : "days"}
        {recap.longestStreak > 1 && <>, a {recap.longestStreak}-day streak</>}
        {recap.busiestDay && recap.busiestDay.seconds >= 60 && (
          <>
            , busiest on{" "}
            {new Date(recap.busiestDay.day + "T12:00").toLocaleDateString(undefined, { day: "numeric", month: "long" })}
          </>
        )}
        .
      </p>
      {recap.mostWatched && (
        <button
          type="button"
          onClick={() => onOpenItem(recap.mostWatched!.item.id)}
          className="group mt-6 flex items-center gap-4 rounded-2xl border border-border p-3 text-left transition-colors hover:bg-secondary/40"
        >
          <img src={thumbnailUrl(recap.mostWatched.item)} alt="" className="aspect-video w-28 shrink-0 rounded-lg object-cover" />
          <span className="min-w-0">
            <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">On repeat</span>
            <span className="sensitive line-clamp-2 block font-semibold">{recap.mostWatched.item.title}</span>
            <span className="text-xs text-muted-foreground">{formatWatchTime(recap.mostWatched.seconds)} watched</span>
          </span>
        </button>
      )}
    </div>
  );
}

const LEVELS = ["bg-white/[0.06]", "bg-white/25", "bg-white/45", "bg-white/70", "bg-amber-300"];

/**
 * The last twelve months as separate little calendars, GitHub-style: each
 * month its own block of Monday-to-Sunday week columns, with a gap between
 * months so you can tell where one ends and the next begins.
 */
function DayGrid({ days, today }: { days: Map<string, number>; today: string }) {
  const months = useMemo(() => calendarMonths(days, today), [days, today]);
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[48rem] gap-3">
        {/* Weekday labels, spaced to match the rows beside them: a spacer the
            height of a month name, then seven equal rows. */}
        <div className="flex shrink-0 flex-col">
          <div className="mb-1.5 h-4" />
          <div className="grid flex-1 grid-rows-7 gap-[3px] text-[10px] leading-none text-muted-foreground">
            {WEEKDAYS.map((day, i) => (
              <span key={day} className="flex items-center">
                {i % 2 === 0 ? day : ""}
              </span>
            ))}
          </div>
        </div>

        {months.map(({ month, weeks }) => (
          // Width in proportion to the month's weeks, so every square in the
          // year comes out the same size.
          <div key={month} className="min-w-0" style={{ flex: `${weeks.length} 1 0` }}>
            <p className="mb-1.5 h-4 text-[11px] font-medium leading-4 text-muted-foreground">
              {MONTHS[Number(month.slice(5, 7)) - 1]}
            </p>
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
              {weeks.map((week, w) => (
                <div key={w} className="flex flex-col gap-[3px]">
                  {week.map((slot, d) =>
                    slot === null ? (
                      <span key={d} className="aspect-square w-full" />
                    ) : (
                      <span
                        key={slot.day}
                        title={`${new Date(slot.day + "T12:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} · ${
                          slot.future ? "still to come" : slot.seconds > 0 ? formatWatchTime(slot.seconds) : "nothing"
                        }`}
                        className={cn(
                          "aspect-square w-full rounded-[3px]",
                          slot.future ? "ring-1 ring-inset ring-white/[0.06]" : LEVELS[slot.level],
                          slot.day === today && "ring-1 ring-foreground/70",
                        )}
                      />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        Less
        {LEVELS.map((level) => (
          <span key={level} className={cn("size-3 rounded-[3px]", level)} />
        ))}
        More
      </div>
    </div>
  );
}
