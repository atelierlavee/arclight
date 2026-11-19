import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { formatWatchTime } from "@/lib/insights";
import {
  arrivedAgo,
  setPerformerFollowed,
  setStudioFollowed,
  sharePercent,
  type FollowingStats,
} from "@/lib/followingApi";
import { qk } from "@/lib/queryKeys";
import { useToast } from "@/lib/toast";

/**
 * Following, looked back on: how much of the watching is of who you follow,
 * who led this month, and who you follow but no longer watch. Same visual
 * language as the rest of the page — figures over hairlines, no cards.
 */
export function Following({ stats }: { stats: FollowingStats }) {
  const recent = sharePercent(stats.share.recentFollowed, stats.share.recentTotal);
  const allTime = sharePercent(stats.share.followed, stats.share.total);
  const top = [
    ...stats.top.performers.map((row) => ({ ...row, kind: "performer" as const })),
    ...stats.top.studios.map((row) => ({ ...row, kind: "studio" as const })),
  ]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5);
  const quiet = [
    ...stats.quiet.performers.map((row) => ({ ...row, kind: "performer" as const })),
    ...stats.quiet.studios.map((row) => ({ ...row, kind: "studio" as const })),
  ];

  return (
    <div className="space-y-10">
      <dl className="flex flex-wrap gap-x-14 gap-y-6">
        <Figure label={`Last ${stats.recentDays} days`} value={recent === null ? "—" : `${recent}%`} />
        <Figure label="All time" value={allTime === null ? "—" : `${allTime}%`} />
        <Figure label="Following" value={String(stats.following.performers + stats.following.studios)} />
      </dl>
      <p className="-mt-6 max-w-prose text-sm text-muted-foreground">
        Of the time you've watched, the share that was someone or some studio you follow.
      </p>

      <div className="grid gap-10 md:grid-cols-2">
        {top.length > 0 && (
          <div>
            <Heading>Most watched this month</Heading>
            <ol className="divide-y divide-border border-y border-border">
              {top.map((row, index) => (
                <li key={`${row.kind}${row.id}`} className="flex items-baseline gap-4 py-2.5">
                  <span className="w-5 font-mono text-sm tabular-nums text-muted-foreground">{index + 1}</span>
                  <EntityLink kind={row.kind} id={row.id} name={row.name} />
                  <span className="font-semibold tabular-nums">{formatWatchTime(row.seconds)}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {quiet.length > 0 && (
          <div>
            <Heading>Gone quiet</Heading>
            <p className="-mt-1 mb-3 text-xs text-muted-foreground">
              Followed, but not watched in over {stats.quietDays} days.
            </p>
            <ol className="divide-y divide-border border-y border-border">
              {quiet.map((row) => (
                <QuietRow key={`${row.kind}${row.id}`} row={row} />
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
      {children}
    </h3>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-5xl font-black tabular-nums tracking-tight">{value}</dd>
    </div>
  );
}

function EntityLink({ kind, id, name }: { kind: "performer" | "studio"; id: number; name: string }) {
  const className = "sensitive min-w-0 flex-1 truncate hover:underline";
  return kind === "performer" ? (
    <Link to="/performer/$performerId" params={{ performerId: String(id) }} className={className}>
      {name}
    </Link>
  ) : (
    <Link to="/studio/$studioId" params={{ studioId: String(id) }} className={className}>
      {name}
    </Link>
  );
}

function QuietRow({
  row,
}: {
  row: {
    kind: "performer" | "studio";
    id: number;
    name: string;
    lastWatchedAt: string | null;
    videoCount: number;
  };
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function unfollow() {
    setPending(true);
    try {
      if (row.kind === "performer") await setPerformerFollowed(row.id, false);
      else await setStudioFollowed(row.id, false);
      for (const queryKey of [
        qk.following.all,
        qk.followingSummary,
        qk.mediaItems.all,
        qk.performers.all,
        qk.studios.all,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      toast({ title: `Unfollowed ${row.name}` });
    } catch (error) {
      toast({
        title: "That didn't work",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
      setPending(false);
    }
  }

  const ago = arrivedAgo(row.lastWatchedAt);
  return (
    <li className="flex items-baseline gap-4 py-2.5">
      <EntityLink kind={row.kind} id={row.id} name={row.name} />
      <span className="shrink-0 text-xs text-muted-foreground">
        {ago ? `last watched ${ago}` : "not watched since following"}
      </span>
      <button
        type="button"
        onClick={() => void unfollow()}
        disabled={pending}
        className="shrink-0 rounded-full px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive disabled:opacity-50"
      >
        Unfollow
      </button>
    </li>
  );
}
