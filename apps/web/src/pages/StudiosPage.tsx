import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { EditDialog } from "@/components/EditDialog";
import { EDIT_INPUT } from "@/lib/editForm";
import { useIsOwner } from "@/lib/profile";
import { AppShell } from "@/components/AppShell";
import { PageScope } from "@/lib/appearance";
import { StudioCard } from "@/components/StudioCard";
import { createStudio, fetchStudios } from "@/lib/studioApi";
import { AlphabetIndex } from "@/components/AlphabetIndex";
import { pinsChangedEvent, readPins } from "@/lib/pinned";
import { qk } from "@/lib/queryKeys";

export function StudiosPage() {
  const [letter, setLetter] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const isOwner = useIsOwner();
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AlphabetIndex
              value={letter}
              onChange={setLetter}
              available={studios.map((studio) => studio.name)}
            />
            {/* The only studio made by hand: a site arrives with its files,
                but nothing on disk ever names the network above it. */}
            {isOwner && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3.5" />
                New network
              </button>
            )}
          </div>
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
        {creating && <NewNetworkDialog onClose={() => setCreating(false)} />}
      </AppShell>
    </PageScope>
  );
}

function NewNetworkDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () => createStudio(name),
    onSuccess: (studio) => {
      queryClient.invalidateQueries({ queryKey: qk.studios.all });
      // Straight to its page, where its sites are chosen from each site's
      // own page — "Part of network".
      void navigate({ to: "/studio/$studioId", params: { studioId: String(studio.id) } });
    },
  });

  return (
    <EditDialog title="New network" onClose={onClose}>
      <p className="text-xs text-muted-foreground">
        A studio that groups others, like a company and its sites. Then open each site and set
        &ldquo;Part of network&rdquo; to this one.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) create.mutate();
        }}
        placeholder="Network name"
        autoFocus
        className={EDIT_INPUT}
      />
      {create.error && <p className="text-xs text-destructive">{create.error.message}</p>}
      <button
        type="button"
        onClick={() => create.mutate()}
        disabled={create.isPending || !name.trim()}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
      >
        Create
      </button>
    </EditDialog>
  );
}
