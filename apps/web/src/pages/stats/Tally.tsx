// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { tallySummary, type Insights, type TallyRow } from "@/lib/insights";

/**
 * The O-counter, as figures and two ranked lists: big numbers over hairline
 * rules, like the rest of the page — no cards.
 */
export function Tally({
  data,
  onOpenItem,
}: {
  data: Insights;
  onOpenItem: (id: number) => void;
}) {
  const summary = useMemo(() => tallySummary(data), [data]);

  return (
    <div className="space-y-10">
      <dl className="flex flex-wrap gap-x-14 gap-y-6">
        <Figure label="Counted" value={summary.total} />
        <Figure label="Days" value={summary.activeDays} />
        <Figure label="Videos" value={summary.videoCount} />
      </dl>

      <div className="grid gap-10 md:grid-cols-2">
        <Ranking title="Most counted videos" rows={summary.videos} onOpen={onOpenItem} />
        <Ranking title="Most counted performers" rows={summary.performers} />
      </div>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-5xl font-black tabular-nums tracking-tight">{value}</dd>
    </div>
  );
}

function Ranking({
  title,
  rows,
  onOpen,
}: {
  title: string;
  rows: TallyRow[];
  onOpen?: (id: number) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">{title}</h3>
      <ol className="divide-y divide-border border-y border-border">
        {rows.map((row, index) => (
          <li key={row.id} className="flex items-baseline gap-4 py-2.5">
            <span className="w-5 font-mono text-sm tabular-nums text-muted-foreground">{index + 1}</span>
            {onOpen ? (
              <button type="button" onClick={() => onOpen(row.id)} className="min-w-0 flex-1 truncate text-left hover:underline">
                {row.name}
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
            )}
            <span className="font-semibold tabular-nums">{row.count}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
