// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  HardDrive,
  Library,
  ScanLine,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { formatBytes, useLibraryStats } from "@/lib/statsApi";
import { ScanSummary } from "./ScanSummary";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function LibraryHealthSection() {
  const { data, isError, isLoading } = useLibraryStats();

  if (isLoading) {
    return <div className="skeleton h-72 rounded-lg" />;
  }
  if (isError || !data) {
    return (
      <p className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Library health is unavailable.
      </p>
    );
  }

  const available = Math.max(0, data.videoTotal - data.videoMissing);
  const healthPercent = data.videoTotal
    ? Math.round((available / data.videoTotal) * 100)
    : 100;
  const scanHealthy = data.lastScan?.status === "completed";

  return (
    <section
      className="space-y-4 rounded-lg border border-border bg-card/60 p-5"
      aria-labelledby="library-health-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Library className="size-4 text-muted-foreground" />
            <h2 id="library-health-title" className="text-base font-semibold">
              Library health
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            A quick read on which videos are available and what needs
            attention.
          </p>
        </div>
        <span className="text-2xl font-semibold tabular-nums">
          {healthPercent}%
        </span>
      </div>

      <div
        className="h-2 overflow-hidden rounded-full bg-secondary"
        aria-label={`${healthPercent}% of library available`}
      >
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width]"
          style={{ width: `${healthPercent}%` }}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Metric
          icon={Library}
          label="Total videos"
          value={data.videoTotal.toLocaleString()}
        />
        <Metric
          icon={CheckCircle2}
          label="Available"
          value={available.toLocaleString()}
          tone="positive"
        />
        <Metric
          icon={AlertTriangle}
          label="Missing"
          value={data.videoMissing.toLocaleString()}
          tone={data.videoMissing > 0 ? "warning" : "positive"}
          to="/missing"
        />
        <Metric
          icon={Copy}
          label="Duplicate groups"
          value={data.videoDuplicateGroups.toLocaleString()}
          tone={data.videoDuplicateGroups > 0 ? "warning" : "positive"}
        />
        <Metric
          icon={HardDrive}
          label="Storage"
          value={formatBytes(data.videoBytes)}
        />
        <Metric
          icon={ScanLine}
          label="Last scan"
          // Just the date. The status word rode along here until it made the
          // value twice as long as any other tile's; the icon's tone already
          // says whether the last scan was healthy.
          value={
            data.lastScan
              ? formatDate(data.lastScan.finishedAt ?? data.lastScan.startedAt)
              : "Never"
          }
          tone={scanHealthy ? "positive" : "neutral"}
        />
      </div>

      {/* What the last scan actually did, beneath the standing totals above
          — the metrics say where the library is, this says what changed to
          get it there (§15). */}
      <ScanSummary />

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{data.videos.toLocaleString()} videos</span>
        <span>Last backup: {formatDate(data.lastBackup)}</span>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
  to,
  search,
}: {
  icon: typeof Library;
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "warning";
  /** Where the tile leads, for the counts that are actionable. */
  to?: "/missing";
  search?: { tab: string };
}) {
  // The label holds its width and the value takes what is left, rather than
  // the other way round. Most values here are a short number, but "Last scan"
  // is a status and a timestamp: as the flexible item the label collapsed to
  // "La / scan", and the value — which had no min-width of its own to shrink
  // below — spilled out of its box and printed over the top of it.
  const content = (
    <div className="flex items-center gap-3 rounded-md border border-border/70 bg-background/40 px-3 py-2.5">
      <Icon
        className={
          tone === "warning"
            ? "size-4 shrink-0 text-amber-500"
            : "size-4 shrink-0 text-muted-foreground"
        }
      />
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <strong className="ml-auto min-w-0 break-words text-right text-sm tabular-nums text-foreground">
        {value}
      </strong>
    </div>
  );
  return to ? (
    <Link to={to} search={search}>
      {content}
    </Link>
  ) : (
    content
  );
}
