import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ScrollRow } from "./ScrollRow";
import { StudioCard } from "./StudioCard";
import { fetchStudios } from "@/lib/studioApi";
import { pinsChangedEvent, readPins } from "@/lib/pinned";
import { pickIndex, seededRank } from "@/lib/shuffle";
import { ROW_TILE_LIMIT } from "@/lib/rowLimits";
import { SeeMoreTile } from "./SeeMoreTile";
import { qk } from "@/lib/queryKeys";

/**
 * Studios, as a homepage row.
 *
 * Not in the sidebar: at this library's size studio is a weak browsing axis —
 * more than half have a single video — so it earns a row you scroll past, not
 * a permanent nav entry competing with Performers.
 *
 * Pinned first, then shuffled. It was ordered by size, on the reasoning that
 * the two studios holding most of the library are the only ones worth a click
 * from here — but that made the row the same two tiles every visit, and the
 * rest of the library unreachable from the home page. "See all" is where size
 * ordering still lives.
 */
export function StudioRow() {
  const [, refreshPins] = useState(0);
  useEffect(() => {
    const refresh = () => refreshPins((value) => value + 1);
    window.addEventListener(pinsChangedEvent(), refresh);
    return () => window.removeEventListener(pinsChangedEvent(), refresh);
  }, []);
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: qk.studios.all,
    queryFn: fetchStudios,
  });

  /**
   * One frame per studio, picked at random from the handful the API sends.
   *
   * Seeded on when the data last arrived rather than on `Math.random`, which
   * would be genuinely random during render — React can run a render and
   * throw it away, so the row could deal itself a new hand of pictures while
   * you were looking at it. Seeded, the choice is fixed for as long as the
   * data is, and moves the moment a refetch brings new data.
   */
  const frames = useMemo(() => {
    const chosen = new Map<number, number | null>();
    for (const studio of data?.studios ?? []) {
      const ids = studio.frameItemIds;
      chosen.set(
        studio.id,
        ids.length > 0
          ? ids[pickIndex(studio.id, dataUpdatedAt, ids.length)]
          : studio.representativeItemId,
      );
    }
    return chosen;
  }, [data, dataUpdatedAt]);

  // The API deliberately keeps studios with no videos — one exists because a
  // filename named it — but there's nothing to show for them here.
  const studios = (data?.studios ?? [])
    .filter((s) => s.videoCount > 0)
    .sort(
      (a, b) =>
        Number(
          readPins().some(
            (pin) => pin.type === "studio" && pin.studioId === b.id,
          ),
        ) -
          Number(
            readPins().some(
              (pin) => pin.type === "studio" && pin.studioId === a.id,
            ),
          ) || seededRank(a.id, dataUpdatedAt) - seededRank(b.id, dataUpdatedAt),
    )
    // Capped after sorting, so the biggest studios survive rather than
    // whichever ones the API happened to send first.
    .slice(0, ROW_TILE_LIMIT);

  return (
    <ScrollRow
      title="Studios"
      itemCount={studios.length}
      loading={isLoading}
    >
      {isLoading
        ? // Wider tiles than the other rows, so fewer of them reach the edge.
          Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`placeholder-${index}`}
              className="skeleton aspect-video w-64 shrink-0 rounded-lg sm:w-72"
            />
          ))
        : studios.map((studio) => (
            <StudioCard
              key={studio.id}
              studio={studio}
              frameItemId={frames.get(studio.id) ?? studio.representativeItemId}
              className="w-64 shrink-0 sm:w-72"
            />
          ))}

      {!isLoading && studios.length > 0 && (
        <SeeMoreTile
          destination={{ to: "/studios" }}
          className="w-64 shrink-0 sm:w-72"
          aspectRatio="16 / 9"
        />
      )}
    </ScrollRow>
  );
}
