import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, Plus, Rss } from "lucide-react";
import { PerformerAvatar } from "../PerformerAvatar";
import { fetchFollowing } from "@/lib/followingApi";
import { performerPortraitUrl } from "@/lib/performerApi";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

type Bubble = {
  key: string;
  kind: "performer" | "studio";
  id: number;
  name: string;
  src: string | null;
  newCount: number;
  latestAt: string | null;
};

/**
 * Who you follow as a row of round avatars across the top of the feed, like
 * stories: a coloured ring on anyone with something new this week, and a tap
 * narrows the feed to just them. "All" goes back to everyone.
 */
export function FeedStories({
  performerId,
  studioId,
  search,
}: {
  performerId?: number;
  studioId?: number;
  /** The rest of the feed's search, kept as the selection changes. */
  search: { watched?: "false"; order?: "added" };
}) {
  const { data } = useQuery({ queryKey: qk.following.list, queryFn: fetchFollowing });
  if (!data) {
    return (
      <div className="flex gap-4 overflow-hidden px-4 pb-1 sm:px-0">
        {Array.from({ length: 7 }).map((_, n) => (
          <div key={n} className="flex shrink-0 flex-col items-center gap-1.5">
            <div className="skeleton size-16 rounded-full" />
            <div className="skeleton h-2.5 w-12 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // Newest arrival first, so whoever has something new leads.
  const bubbles: Bubble[] = [
    ...data.performers.map((p) => ({
      key: `performer:${p.id}`,
      kind: "performer" as const,
      id: p.id,
      name: p.name,
      src: performerPortraitUrl(p),
      newCount: p.newCount,
      latestAt: p.latestAt,
    })),
    ...data.studios.map((s) => ({
      key: `studio:${s.id}`,
      kind: "studio" as const,
      id: s.id,
      name: s.name,
      src: null,
      newCount: s.newCount,
      latestAt: s.latestAt,
    })),
  ].sort((a, b) => (b.latestAt ?? "").localeCompare(a.latestAt ?? ""));
  if (bubbles.length === 0) return null;

  const nothingSelected = performerId === undefined && studioId === undefined;

  return (
    <ul className="scrollbar-hide flex gap-3.5 overflow-x-auto px-4 pb-1 pt-0.5 sm:px-0">
      <li>
        <Link to="/feed" search={search} className="flex w-[68px] flex-col items-center gap-1.5">
          <Ring active={nothingSelected} hasNew={false}>
            <span className="flex size-full items-center justify-center rounded-full bg-secondary">
              <Rss className="size-5" />
            </span>
          </Ring>
          <span className={cn("text-xs", nothingSelected ? "font-semibold" : "text-muted-foreground")}>
            All
          </span>
        </Link>
      </li>
      {bubbles.map((bubble) => {
        const selected = bubble.kind === "performer" ? performerId === bubble.id : studioId === bubble.id;
        return (
          <li key={bubble.key}>
            <Link
              to="/feed"
              // A second tap on the one already showing goes back to everyone.
              search={
                selected
                  ? search
                  : {
                      ...search,
                      ...(bubble.kind === "performer" ? { performerId: bubble.id } : { studioId: bubble.id }),
                    }
              }
              title={bubble.newCount > 0 ? `${bubble.name} · ${bubble.newCount} new this week` : bubble.name}
              className="flex w-[68px] flex-col items-center gap-1.5"
            >
              <Ring active={selected} hasNew={bubble.newCount > 0}>
                {bubble.kind === "performer" ? (
                  <PerformerAvatar
                    name={bubble.name}
                    src={bubble.src}
                    className="sensitive size-full rounded-full"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center rounded-full bg-secondary">
                    <Building2 className="size-5 text-muted-foreground" />
                  </span>
                )}
              </Ring>
              <span
                className={cn(
                  "sensitive w-full truncate text-center text-xs",
                  selected ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {bubble.name}
              </span>
            </Link>
          </li>
        );
      })}
      <li>
        <Link to="/following" className="flex w-[68px] flex-col items-center gap-1.5">
          <span className="flex size-16 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
            <Plus className="size-5" />
          </span>
          <span className="text-xs text-muted-foreground">Find more</span>
        </Link>
      </li>
    </ul>
  );
}

/**
 * The ring round an avatar: a colour gradient when there is something new,
 * a plain line otherwise, and the accent colour on the one showing.
 */
function Ring({ active, hasNew, children }: { active: boolean; hasNew: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "block size-16 rounded-full p-[2.5px]",
        active
          ? "bg-primary"
          : hasNew
            ? "bg-gradient-to-tr from-amber-400 via-pink-500 to-fuchsia-600"
            : "bg-border",
      )}
    >
      <span className="block size-full rounded-full bg-background p-[2px]">{children}</span>
    </span>
  );
}
