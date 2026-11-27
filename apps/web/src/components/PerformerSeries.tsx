// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useQuery } from "@tanstack/react-query";
import { SeriesCard, usePerformerPortraits } from "./series/SeriesCard";
import { fetchSeries } from "@/lib/seriesApi";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

/**
 * The series a performer appears in, on their page: the same fanned-cover
 * cards as the series list. Nothing at all when they are in none.
 */
export function PerformerSeries({
  performerId,
  name,
  bare = false,
}: {
  performerId: number;
  name: string;
  /** Just the cards, for a view inside the Videos section that has its own heading. */
  bare?: boolean;
}) {
  const { data } = useQuery({
    queryKey: qk.series.byPerformer(performerId),
    queryFn: () => fetchSeries(performerId),
  });
  const portraits = usePerformerPortraits();
  const series = data?.series ?? [];
  if (series.length === 0) return null;
  // A few get room; a row of tiny cards would be mostly empty.
  const large = series.length <= 3;

  return (
    <section className="space-y-10">
      {!bare && (
      <div className="space-y-3 text-center">
        <p className="flex items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
          <span className="h-px w-8 bg-primary/60" />
          Series
          <span className="h-px w-8 bg-primary/60" />
        </p>
        <h2 className="sensitive text-2xl font-black tracking-tight md:text-3xl">
          {name}'s stories, <span className="text-primary">episode by episode</span>.
        </h2>
        <p className="text-sm text-muted-foreground">
          {series.length} series
        </p>
      </div>
      )}
      <div
        className={cn(
          "mx-auto grid max-w-5xl gap-x-6 gap-y-12",
          large
            ? series.length === 1
              ? "max-w-md grid-cols-1"
              : series.length === 2
                ? "max-w-3xl grid-cols-1 sm:grid-cols-2"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
        )}
      >
        {series.map((entry) => (
          <SeriesCard key={entry.id} entry={entry} portraits={portraits} large={large} />
        ))}
      </div>
    </section>
  );
}
