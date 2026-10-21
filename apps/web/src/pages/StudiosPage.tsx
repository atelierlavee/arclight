import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PageScope } from "@/lib/appearance";
import { StudioCard } from "@/components/StudioCard";
import { fetchStudios } from "@/lib/studioApi";
import { AlphabetIndex } from "@/components/AlphabetIndex";
import { pinsChangedEvent, readPins } from "@/lib/pinned";
import { qk } from "@/lib/queryKeys";

export function StudiosPage() {
  const [letter, setLetter] = useState<string | null>(null);
  const [, refreshPins] = useState(0);
  useEffect(() => {
    const refresh = () => refreshPins((value) => value + 1);
    window.addEventListener(pinsChangedEvent(), refresh);
    return () => window.removeEventListener(pinsChangedEvent(), refresh);
  }, []);
  const { data, isLoading } = useQuery({
    queryKey: qk.studios.all,
    queryFn: fetchStudios,
  });
  const studios = data?.studios ?? [];
  const pinnedIds = new Set(
    readPins()
      .filter((pin) => pin.type === "studio")
      .map((pin) => pin.studioId),
  );

  // Zero-video studios are kept, matching the performers page: one exists
  // because a filename named it, and it comes back the moment that folder is
  // scanned again.
  const orderedStudios = [...studios].sort(
    (a, b) =>
      Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)) ||
      b.videoCount - a.videoCount ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  const visibleStudios = letter
    ? orderedStudios.filter((studio) => {
        const initial = studio.name.trim().charAt(0).toUpperCase();
        return letter === "#" ? !/^[A-Z]$/.test(initial) : initial === letter;
      })
    : orderedStudios;
  const visibleWithVideos = visibleStudios.filter(
    (studio) => studio.videoCount > 0,
  );
  const visibleEmpty = visibleStudios.filter(
    (studio) => studio.videoCount === 0,
  );

  return (
    <PageScope name="studios">
      <AppShell
        title="Studios"
        subtitle={
          studios.length > 0
            ? `${studios.length} ${studios.length === 1 ? "studio" : "studios"}`
            : undefined
        }
      >
        <div className="space-y-8 px-4 py-6 md:px-6">
          <AlphabetIndex
            value={letter}
            onChange={setLetter}
            available={studios.map((studio) => studio.name)}
          />
          {isLoading && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton aspect-video rounded-lg" />
              ))}
            </div>
          )}

          {!isLoading && visibleStudios.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No studios yet. They're picked up from a filename's leading [Studio]
              tag, or from the folder above your videos, when you scan.
            </p>
          )}

          {visibleWithVideos.length > 0 && (
            <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {visibleWithVideos.map((studio) => (
                <StudioCard key={studio.id} studio={studio} />
              ))}
            </div>
          )}

          {visibleEmpty.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold tracking-tight text-muted-foreground">
                No videos right now
              </h2>
              <p className="max-w-prose text-xs text-muted-foreground/70">
                Their folder isn't currently being scanned. Nothing about them is
                lost.
              </p>
              <div className="stagger grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {visibleEmpty.map((studio) => (
                  <StudioCard key={studio.id} studio={studio} />
                ))}
              </div>
            </section>
          )}
        </div>
      </AppShell>
    </PageScope>
  );
}
