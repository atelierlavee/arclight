import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, Sparkles, UserCheck, UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PerformerAvatar } from "@/components/PerformerAvatar";
import {
  arrivedAgo,
  fetchFollowing,
  fetchSuggestions,
  setPerformerFollowed,
  setStudioFollowed,
  suggestionReasons,
  type FollowedPerformer,
  type FollowedStudio,
} from "@/lib/followingApi";
import { performerPortraitUrl } from "@/lib/performerApi";
import { thumbnailUrl } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Everyone and every studio this profile follows, newest arrivals first,
 * and below them who it might want to follow next.
 */
export function FollowingPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const { data: following, isLoading } = useQuery({
    queryKey: qk.following.list,
    queryFn: fetchFollowing,
  });
  const { data: suggestions } = useQuery({
    queryKey: qk.following.suggestions,
    queryFn: fetchSuggestions,
  });

  async function toggle(kind: "performer" | "studio", id: number, name: string, follow: boolean) {
    const key = `${kind}:${id}`;
    setPending(key);
    try {
      if (kind === "performer") await setPerformerFollowed(id, follow);
      else await setStudioFollowed(id, follow);
      for (const queryKey of [
        qk.following.all,
        qk.followingSummary,
        qk.mediaItems.all,
        qk.performers.all,
        qk.studios.all,
        kind === "performer" ? qk.performer.all : qk.studio.all,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      toast({ title: follow ? `Following ${name}` : `Unfollowed ${name}` });
    } catch (error) {
      toast({
        title: "That didn't work",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setPending(null);
    }
  }

  const performers = following?.performers ?? [];
  const studios = following?.studios ?? [];
  const totalNew =
    performers.reduce((sum, p) => sum + p.newCount, 0) + studios.reduce((sum, s) => sum + s.newCount, 0);
  const suggestedPerformers = suggestions?.performers ?? [];
  const suggestedStudios = suggestions?.studios ?? [];
  const nothingFollowed = !isLoading && performers.length === 0 && studios.length === 0;

  return (
    <AppShell
      title="Following"
      subtitle={
        following && !nothingFollowed
          ? `${performers.length + studios.length} followed${totalNew ? ` · ${totalNew} new this week` : ""}`
          : undefined
      }
      actions={
        totalNew > 0 ? (
          <Link
            to="/browse"
            search={{ following: "true", watched: "false" }}
            className="rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            See what's new
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-10 px-4 py-6 md:px-6 md:py-8">
        {nothingFollowed && (
          <div className="max-w-prose space-y-1 text-sm text-muted-foreground">
            <p>You aren't following anyone yet.</p>
            <p>
              Follow a performer or a studio from their page — or from the suggestions below — and
              their new videos show up on your home page and in the bell.
            </p>
          </div>
        )}

        {performers.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">Performers</h2>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {performers.map((performer) => (
                <FollowedRow
                  key={performer.id}
                  kind="performer"
                  entry={performer}
                  pending={pending === `performer:${performer.id}`}
                  onUnfollow={() => void toggle("performer", performer.id, performer.name, false)}
                />
              ))}
            </ul>
          </section>
        )}

        {studios.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold tracking-tight">Studios</h2>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {studios.map((studio) => (
                <FollowedRow
                  key={studio.id}
                  kind="studio"
                  entry={studio}
                  pending={pending === `studio:${studio.id}`}
                  onUnfollow={() => void toggle("studio", studio.id, studio.name, false)}
                />
              ))}
            </ul>
          </section>
        )}

        {(suggestedPerformers.length > 0 || suggestedStudios.length > 0) && (
          <section className="space-y-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                <Sparkles className="size-3.5 text-amber-400" />
                You might want to follow
              </h2>
              <p className="text-xs text-muted-foreground">
                From what you already watch, count and favourite — never anyone else's history.
              </p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {suggestedPerformers.map((performer) => (
                <SuggestionRow
                  key={`p${performer.id}`}
                  to={{ kind: "performer", id: performer.id }}
                  name={performer.name}
                  image={
                    <PerformerAvatar
                      name={performer.name}
                      src={performerPortraitUrl(performer)}
                      className="size-11 shrink-0"
                    />
                  }
                  reasons={suggestionReasons(performer, performer.isFavorite)}
                  pending={pending === `performer:${performer.id}`}
                  onFollow={() => void toggle("performer", performer.id, performer.name, true)}
                />
              ))}
              {suggestedStudios.map((studio) => (
                <SuggestionRow
                  key={`s${studio.id}`}
                  to={{ kind: "studio", id: studio.id }}
                  name={studio.name}
                  image={<StudioThumb itemId={studio.representativeItemId} />}
                  reasons={suggestionReasons(studio)}
                  pending={pending === `studio:${studio.id}`}
                  onFollow={() => void toggle("studio", studio.id, studio.name, true)}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function StudioThumb({ itemId }: { itemId: number | null }) {
  return itemId ? (
    <img
      src={thumbnailUrl({ id: itemId })}
      alt=""
      className="sensitive aspect-video w-16 shrink-0 rounded object-cover"
    />
  ) : (
    <div className="flex aspect-video w-16 shrink-0 items-center justify-center rounded bg-secondary">
      <Building2 className="size-4 text-muted-foreground" />
    </div>
  );
}

function EntityLink({
  to,
  className,
  children,
}: {
  to: { kind: "performer" | "studio"; id: number };
  className?: string;
  children: React.ReactNode;
}) {
  return to.kind === "performer" ? (
    <Link to="/performer/$performerId" params={{ performerId: String(to.id) }} className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/studio/$studioId" params={{ studioId: String(to.id) }} className={className}>
      {children}
    </Link>
  );
}

function FollowedRow({
  kind,
  entry,
  pending,
  onUnfollow,
}: {
  kind: "performer" | "studio";
  entry: FollowedPerformer | FollowedStudio;
  pending: boolean;
  onUnfollow: () => void;
}) {
  const ago = arrivedAgo(entry.latestAt);
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-2 pr-3">
      <EntityLink to={{ kind, id: entry.id }} className="flex min-w-0 flex-1 items-center gap-3">
        {kind === "performer" && "hasImage" in entry ? (
          <PerformerAvatar
            name={entry.name}
            src={performerPortraitUrl(entry)}
            className="size-11 shrink-0"
          />
        ) : (
          <StudioThumb itemId={entry.representativeItemId} />
        )}
        <span className="min-w-0 flex-1">
          <span className="sensitive flex items-center gap-2 truncate text-sm font-medium">
            {entry.name}
            {entry.newCount > 0 && (
              <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400">
                {entry.newCount} new
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {entry.videoCount} video{entry.videoCount === 1 ? "" : "s"}
            {ago && ` · latest ${ago}`}
          </span>
        </span>
      </EntityLink>
      <button
        type="button"
        onClick={onUnfollow}
        disabled={pending}
        title={`Unfollow ${entry.name}`}
        aria-label={`Unfollow ${entry.name}`}
        className="group flex h-7 shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 text-xs transition-colors hover:bg-destructive/20 hover:text-destructive disabled:opacity-50"
      >
        <UserCheck className="size-3.5" />
        <span className="group-hover:hidden">Following</span>
        <span className="hidden group-hover:inline">Unfollow</span>
      </button>
    </li>
  );
}

function SuggestionRow({
  to,
  name,
  image,
  reasons,
  pending,
  onFollow,
}: {
  to: { kind: "performer" | "studio"; id: number };
  name: string;
  image: React.ReactNode;
  reasons: string[];
  pending: boolean;
  onFollow: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-dashed border-border p-2 pr-3">
      <EntityLink to={to} className="flex min-w-0 flex-1 items-center gap-3">
        {image}
        <span className="min-w-0 flex-1">
          <span className="sensitive block truncate text-sm font-medium">{name}</span>
          <span className="block truncate text-xs text-muted-foreground">{reasons.join(" · ")}</span>
        </span>
      </EntityLink>
      <button
        type="button"
        onClick={onFollow}
        disabled={pending}
        className={cn(
          "flex h-7 shrink-0 items-center gap-1 rounded-full bg-white px-2.5 text-xs font-medium text-black transition-colors hover:bg-white/90 disabled:opacity-50",
        )}
      >
        <UserPlus className="size-3.5" />
        Follow
      </button>
    </li>
  );
}
