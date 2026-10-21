import { formatWatchTime, type Insights } from "@/lib/insights";
import { Bars } from "./Bars";
import { hourName, watchHistograms, WEEKDAY_NAMES, WEEKDAYS } from "./statsData";

export function Habits({ data, lateShare }: { data: Insights; lateShare: number }) {
  const { byHour, byWeekday } = watchHistograms(data.log);
  const primeHour = byHour.indexOf(Math.max(...byHour));
  const bestDay = byWeekday.indexOf(Math.max(...byWeekday));
  const late = Math.round(lateShare * 100);

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div>
        <p className="mb-2 text-2xl font-bold tracking-tight">
          Prime time is <span className="text-amber-300">{hourName(primeHour)}</span>.
        </p>
        <p className="mb-6 text-sm text-muted-foreground">
          {late >= 50
            ? `${late}% of your watching happens after 10 pm — a certified night owl 🦉`
            : `${late}% of your watching happens after 10 pm.`}
        </p>
        <Bars
          values={byHour}
          labels={byHour.map((_, h) => hourName(h))}
          axisLabels={byHour.map((_, h) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "a" : "p"}`)}
          format={(v) => (v > 0 ? formatWatchTime(v) : "nothing")}
          labelEvery={3}
        />
      </div>
      <div>
        <p className="mb-2 text-2xl font-bold tracking-tight">
          <span className="text-amber-300">{WEEKDAY_NAMES[bestDay]}</span> is your day.
        </p>
        <p className="mb-6 text-sm text-muted-foreground">Time watched on each day of the week.</p>
        <Bars values={byWeekday} labels={WEEKDAYS} format={(v) => (v > 0 ? formatWatchTime(v) : "nothing")} />
      </div>
    </div>
  );
}
