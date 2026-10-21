import { useMemo } from "react";
import { libraryMilestones, type Insights } from "@/lib/insights";

export function MilestonesTimeline({ data }: { data: Insights }) {
  const milestones = useMemo(() => libraryMilestones(data), [data]);
  if (milestones.length === 0) return null;

  return (
    <div className="relative ml-4 border-l border-white/10 pl-8">
      {milestones.map((m, i) => (
        <div key={i} className="relative pb-8 last:pb-0">
          <span className="absolute -left-[calc(2rem+5px)] top-1.5 size-2.5 rounded-full bg-amber-400" />
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {new Date(m.date + "T12:00").toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          <p className="mt-0.5 text-base font-semibold">{m.label}</p>
          {m.detail && (
            <p className="mt-0.5 text-sm text-muted-foreground">{m.detail}</p>
          )}
        </div>
      ))}
    </div>
  );
}
