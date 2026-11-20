import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Building2, Loader2, X } from "lucide-react";
import { useState } from "react";
import { PerformerAvatar } from "../PerformerAvatar";
import { fetchSuggestions, suggestionReasons } from "@/lib/followingApi";
import { performerPortraitUrl } from "@/lib/performerApi";
import { qk } from "@/lib/queryKeys";
import { useFollowToggle } from "@/lib/useFollowToggle";

/**
 * "Suggested for you", slipped in between posts the way a social feed does:
 * a row of profile cards you scroll sideways, each with a Follow button.
 * A card can be dismissed for this visit; following one removes it for good.
 */
export function FeedSuggestions() {
  const { data } = useQuery({ queryKey: qk.following.suggestions, queryFn: fetchSuggestions });
  const { setFollowed, pending } = useFollowToggle();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const cards = [
    ...(data?.performers ?? []).map((p) => ({
      key: `performer:${p.id}`,
      kind: "performer" as const,
      id: p.id,
      name: p.name,
      src: performerPortraitUrl(p),
      reason: suggestionReasons(p, p.isFavorite)[0] ?? "Performer",
    })),
    ...(data?.studios ?? []).map((s) => ({
      key: `studio:${s.id}`,
      kind: "studio" as const,
      id: s.id,
      name: s.name,
      src: null,
      reason: suggestionReasons(s)[0] ?? "Studio",
    })),
  ].filter((card) => !dismissed.has(card.key));
  if (cards.length === 0) return null;

  return (
    <section className="border-y border-border bg-card py-3.5 sm:rounded-xl sm:border">
      <div className="mb-3 flex items-center justify-between px-4">
        <h2 className="text-sm font-semibold">Suggested for you</h2>
        <Link to="/following" className="text-xs font-semibold text-primary hover:underline">
          See all
        </Link>
      </div>
      <ul className="scrollbar-hide flex snap-x gap-3 overflow-x-auto px-4">
        {cards.map((card) => {
          const link =
            card.kind === "performer"
              ? ({ to: "/performer/$performerId", params: { performerId: String(card.id) } } as const)
              : ({ to: "/studio/$studioId", params: { studioId: String(card.id) } } as const);
          return (
            <li
              key={card.key}
              className="relative flex w-[156px] shrink-0 snap-start flex-col items-center rounded-lg border border-border px-3 pb-3 pt-5 text-center"
            >
              <button
                type="button"
                onClick={() => setDismissed((d) => new Set(d).add(card.key))}
                aria-label={`Not now, ${card.name}`}
                title="Not now"
                className="absolute right-1.5 top-1.5 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
              <Link {...link} className="flex w-full flex-col items-center">
                {card.kind === "performer" ? (
                  <PerformerAvatar
                    name={card.name}
                    src={card.src}
                    className="sensitive size-20 rounded-full"
                  />
                ) : (
                  <span className="flex size-20 items-center justify-center rounded-full bg-secondary">
                    <Building2 className="size-7 text-muted-foreground" />
                  </span>
                )}
                <span className="sensitive mt-2.5 w-full truncate text-sm font-semibold hover:underline">
                  {card.name}
                </span>
              </Link>
              <span className="mt-0.5 w-full truncate text-xs text-muted-foreground">{card.reason}</span>
              <button
                type="button"
                disabled={pending !== null}
                onClick={() => void setFollowed(card, true)}
                className="mt-3 flex h-8 w-full items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pending === card.key ? <Loader2 className="size-4 animate-spin" /> : "Follow"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
