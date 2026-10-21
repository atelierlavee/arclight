import { useMemo } from "react";
import { personalRecords, type Insights } from "@/lib/insights";
import { cn } from "@/lib/utils";

export function Records({ data, onOpenItem }: { data: Insights; onOpenItem: (id: number) => void }) {
  const records = useMemo(() => personalRecords(data), [data]);
  if (records.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {records.map((record) => (
        <button
          key={record.label}
          type="button"
          disabled={!record.itemId}
          onClick={() => record.itemId && onOpenItem(record.itemId)}
          className={cn(
            "rounded-xl bg-white/[0.04] p-5 text-left ring-1 ring-white/[0.06] transition-colors",
            record.itemId && "hover:bg-white/[0.07] cursor-pointer",
          )}
        >
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {record.label}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{record.value}</p>
          {record.detail && (
            <p className="mt-1 truncate text-sm text-muted-foreground">{record.detail}</p>
          )}
        </button>
      ))}
    </div>
  );
}
