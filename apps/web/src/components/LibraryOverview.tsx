// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight, Copy, HardDrive, ShieldAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { backupAgeDays, isBackupStale } from "@/lib/backupApi";
import { settingsAnchor } from "@/lib/settingsAnchor";
import { formatBytes, useLibraryStats } from "@/lib/statsApi";
import { cn } from "@/lib/utils";
import { RescanButton } from "./RescanButton";
import { ScanSummary } from "./ScanSummary";
import { settingsCardClass } from "./SettingsSection";

type Jump = { tab: "library" | "backup"; anchor: string };

function ageLabel(createdAt: string | null): string {
  const days = backupAgeDays(createdAt);
  if (days === null) return "Never";
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  return `${Math.floor(days)} days ago`;
}

function scanLabel(value: string | null | undefined): string {
  if (!value) return "never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/**
 * The top of the Library page: how healthy the library is, what needs
 * attention, and a rescan — the things a visit here is usually for — in one
 * card, each figure leading to the section that deals with it.
 *
 * It replaces a row of status tiles and a "Library health" card underneath
 * that repeated the same four numbers in a different shape.
 */
export function LibraryOverview({ onJump }: { onJump: (target: Jump) => void }) {
  const { data, isLoading, isError } = useLibraryStats();

  if (isLoading) return <div className="skeleton h-72 rounded-xl" />;
  if (isError || !data) {
    return (
      <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Library health is unavailable.
      </p>
    );
  }

  const available = Math.max(0, data.videoTotal - data.videoMissing);
  const percent = data.videoTotal ? Math.round((available / data.videoTotal) * 100) : 100;
  const healthy = data.videoMissing === 0;
  const stale = isBackupStale(data.lastBackup);
  const scannedAt = data.lastScan?.finishedAt ?? data.lastScan?.startedAt;

  const tiles: { label: string; value: string; icon: LucideIcon; warn: boolean; jump?: Jump; to?: "/missing" }[] = [
    {
      label: "Missing",
      value: data.videoMissing ? data.videoMissing.toLocaleString() : "None",
      icon: data.videoMissing ? TriangleAlert : CheckCircle2,
      warn: data.videoMissing > 0,
      to: data.videoMissing ? "/missing" : undefined,
    },
    {
      label: "Duplicates",
      value: data.videoDuplicateGroups ? data.videoDuplicateGroups.toLocaleString() : "None",
      icon: Copy,
      warn: data.videoDuplicateGroups > 0,
      jump: { tab: "library", anchor: settingsAnchor("Duplicates") },
    },
    {
      label: "Space used",
      value: formatBytes(data.totalBytes),
      icon: HardDrive,
      warn: false,
    },
    {
      label: "Last backup",
      value: ageLabel(data.lastBackup),
      icon: stale ? ShieldAlert : CheckCircle2,
      warn: stale,
      jump: { tab: "backup", anchor: settingsAnchor("Backup") },
    },
  ];

  return (
    <section
      aria-labelledby="library-health-title"
      className={cn(settingsCardClass, "divide-y divide-border/70")}
    >
      <div
        className={cn(
          "flex flex-col gap-5 bg-gradient-to-br to-transparent p-5 sm:flex-row sm:items-center md:p-6",
          healthy ? "from-emerald-500/10" : "from-amber-500/10",
        )}
      >
        <HealthRing percent={percent} healthy={healthy} />
        <div className="min-w-0 flex-1">
          <h3 id="library-health-title" className="scroll-mt-28 text-lg font-semibold tracking-tight">
            {healthy ? "Everything's available" : `${data.videoMissing.toLocaleString()} videos can't be found`}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {available.toLocaleString()} of {data.videoTotal.toLocaleString()} videos ·{" "}
            {formatBytes(data.videoBytes)} · last scanned {scanLabel(scannedAt)}
          </p>
        </div>
        <div className="shrink-0">
          <RescanButton />
        </div>
      </div>

      <div className="grid grid-cols-2 divide-border/70 sm:grid-cols-4 sm:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-border/70 sm:[&>*:nth-child(-n+2)]:border-b-0">
        {tiles.map(({ label, value, icon: Icon, warn, jump, to }) => {
          const body = (
            <>
              <span className="flex items-center justify-between text-xs text-muted-foreground">
                {label}
                <Icon className={cn("size-3.5", warn ? "text-amber-500" : "text-emerald-500")} />
              </span>
              <span className={cn("mt-1.5 block text-xl font-semibold tabular-nums tracking-tight", warn && "text-amber-400")}>
                {value}
              </span>
              {(jump || to) && (
                <span className="mt-1 flex items-center gap-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {to ? "Review" : "Open"} <ChevronRight className="size-3" />
                </span>
              )}
            </>
          );
          const className = "group block p-4 text-left transition-colors hover:bg-accent/40 md:px-5";
          if (to) {
            return (
              <Link key={label} to={to} className={className}>
                {body}
              </Link>
            );
          }
          if (!jump) {
            return (
              <div key={label} className="p-4 md:px-5">
                {body}
              </div>
            );
          }
          return (
            <button key={label} type="button" onClick={() => onJump(jump)} className={className}>
              {body}
            </button>
          );
        })}
      </div>

      <div className="p-5 md:px-6 [&:empty]:hidden [&>div]:border-0 [&>div]:p-0">
        <ScanSummary />
      </div>
    </section>
  );
}

/** The share of videos that are on disk, as a ring. */
function HealthRing({ percent, healthy }: { percent: number; healthy: boolean }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative size-20 shrink-0" role="img" aria-label={`${percent}% of the library available`}>
      <svg viewBox="0 0 72 72" className="size-full -rotate-90">
        <circle cx="36" cy="36" r={radius} fill="none" strokeWidth="6" className="stroke-secondary" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          className={cn("transition-[stroke-dashoffset] duration-700", healthy ? "stroke-emerald-500" : "stroke-amber-500")}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular-nums">
        {percent}%
      </span>
    </div>
  );
}
