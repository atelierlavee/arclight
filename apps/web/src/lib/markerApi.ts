import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "./queryKeys";

/** A named stretch of a video — a position or act — from ThePornDB or added by hand. */
export type Marker = {
  id: number;
  mediaItemId: number;
  title: string;
  startSeconds: number;
  endSeconds: number | null;
  source: "tpdb" | "manual";
};

export type TpdbCandidate = {
  id: string;
  title: string;
  studio: string | null;
  date: string | null;
  durationSeconds: number | null;
  image: string | null;
  performers: string[];
};

export type TpdbMatch = {
  query: { title: string; studio: string | null; date: string | null };
  candidates: TpdbCandidate[];
  confidentId: string | null;
};

export type FetchAllStatus = {
  running: boolean;
  total: number;
  checked: number;
  matched: number;
  markers: number;
  failed: number;
  error: string | null;
  finishedAt: string | null;
};

export type PositionName = { key: string; name: string; markers: number; videos: number };

export type PositionMarker = Marker & {
  item: {
    id: number;
    title: string;
    thumbnailFile: string | null;
    durationSeconds: number | null;
    releaseDate: string | null;
  };
  studio: string | null;
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const send = (method: string, url: string, body?: object) =>
  fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

/**
 * The key two spellings of one position share, so "Standing Doggy Style" and
 * "Standing Doggystyle" look and group alike. Mirrors `groupKey` on the server.
 */
export function markerKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A colour per position name, the same wherever it appears: the third
 * "Missionary" in a scene reads as the first one did.
 */
const HUES = [12, 36, 140, 172, 200, 228, 262, 292, 320, 345];
export function markerColor(title: string): string {
  let hash = 0;
  for (const char of markerKey(title)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${HUES[hash % HUES.length]} 75% 58%)`;
}

export type MarkerSegment = {
  marker: Marker;
  start: number;
  end: number;
  /** Which stacked row it is drawn in; overlapping stretches go below each other. */
  row: number;
};

/** Rows beyond this are folded into the last one rather than growing the bar. */
export const MAX_MARKER_ROWS = 3;

/**
 * Where each marker sits on a bar of `duration` seconds.
 *
 * A marker with no end runs to the next marker that starts after it (sources
 * often give only start times, one position following the next), or to the
 * end of the video. Stretches that overlap are put in separate rows, first
 * row that is free.
 */
export function layoutMarkers(markers: Marker[], duration: number): MarkerSegment[] {
  if (!(duration > 0)) return [];
  const sorted = [...markers]
    .filter((m) => m.startSeconds < duration)
    .sort((a, b) => a.startSeconds - b.startSeconds || a.id - b.id);
  const rowEnds: number[] = [];
  return sorted.map((marker, index) => {
    const next = sorted.slice(index + 1).find((m) => m.startSeconds > marker.startSeconds);
    const end = Math.min(duration, marker.endSeconds ?? next?.startSeconds ?? duration);
    let row = rowEnds.findIndex((rowEnd) => rowEnd <= marker.startSeconds);
    if (row === -1) row = Math.min(rowEnds.length, MAX_MARKER_ROWS - 1);
    rowEnds[row] = Math.max(rowEnds[row] ?? 0, end);
    return { marker, start: marker.startSeconds, end, row };
  });
}

/** The marker playing at a moment: the latest-starting one that covers it. */
export function markerAt(segments: MarkerSegment[], seconds: number): Marker | undefined {
  let found: MarkerSegment | undefined;
  for (const segment of segments) {
    if (segment.start <= seconds && seconds < segment.end) {
      if (!found || segment.start >= found.start) found = segment;
    }
  }
  return found?.marker;
}

export function useMarkers(itemId: number, enabled = true) {
  return useQuery({
    queryKey: qk.markers(itemId),
    queryFn: async () =>
      json<{ markers: Marker[]; tpdbSceneId: string | null; tpdbCheckedAt: string | null }>(
        await fetch(`/api/media-items/${itemId}/markers`),
      ),
    enabled,
  });
}

export function useMarkerMutations(itemId: number) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.markers(itemId) });
    void queryClient.invalidateQueries({ queryKey: qk.positions.all });
  };

  const add = useMutation({
    mutationFn: async (body: { title: string; startSeconds: number; endSeconds?: number | null }) =>
      json<Marker>(await send("POST", `/api/media-items/${itemId}/markers`, body)),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: async ({ id, ...body }: { id: number; title?: string; startSeconds?: number; endSeconds?: number | null }) =>
      json<Marker>(await send("PATCH", `/api/markers/${id}`, body)),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (id: number) => json<{ ok: true }>(await send("DELETE", `/api/markers/${id}`)),
    onSuccess: refresh,
  });
  const applyTpdb = useMutation({
    mutationFn: async (sceneId: string) =>
      json<{ count: number }>(await send("POST", `/api/media-items/${itemId}/tpdb-markers`, { sceneId })),
    onSuccess: refresh,
  });
  return { add, update, remove, applyTpdb };
}

export function useTpdbMatch(itemId: number, enabled: boolean) {
  return useQuery({
    queryKey: qk.tpdbMatch(itemId),
    queryFn: async () => json<TpdbMatch>(await fetch(`/api/tpdb/match/${itemId}`)),
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function useTpdbStatus(enabled = true) {
  return useQuery({
    queryKey: qk.tpdb,
    queryFn: async () => json<{ configured: boolean; fetchAll: FetchAllStatus }>(await fetch("/api/tpdb")),
    enabled,
    // Polls while a library-wide fetch is running, so its progress moves.
    refetchInterval: (query) => (query.state.data?.fetchAll.running ? 2_000 : false),
  });
}

export function useStartFetchAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => json<FetchAllStatus>(await send("POST", "/api/tpdb/fetch-all")),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.tpdb }),
  });
}

export function usePositionNames() {
  return useQuery({
    queryKey: qk.positions.names,
    queryFn: async () => (await json<{ names: PositionName[] }>(await fetch("/api/markers/names"))).names,
  });
}
