// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

/**
 * ThePornDB lookups, for the position markers in a scene.
 *
 * StashDB stays the source for cast, studio, tags and dates; ThePornDB is
 * asked only for markers, because it is the one of the two that has them.
 * Opt-in like StashDB: nothing here runs until `TPDB_API_KEY` is set.
 */

const ENDPOINT = "https://api.theporndb.net";
const TIMEOUT_MS = 15_000;

export class TpdbError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 502,
  ) {
    super(message);
  }
}

/**
 * From the environment, never the database or the page, for the same reason
 * as the StashDB key: a database row would put a credential in every backup.
 */
export function getTpdbKey(): string | null {
  const apiKey = process.env.TPDB_API_KEY?.trim();
  return apiKey ? apiKey : null;
}

type RawSite = { name: string; network?: { name: string } | null; parent?: { name: string } | null };

type RawScene = {
  id: string;
  title: string;
  date: string | null;
  duration: number | null;
  image: string | null;
  site: RawSite | null;
  performers?: { name: string; parent?: { name: string } | null }[];
  markers?: { title: string; start_time: number | null; end_time: number | null }[];
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

export type TpdbMarker = { title: string; startSeconds: number; endSeconds: number | null };

async function tpdbGet<T>(apiKey: string, path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new TpdbError("Could not reach ThePornDB. Check your internet connection.", 502);
  }
  if (res.status === 401 || res.status === 403) {
    throw new TpdbError("ThePornDB rejected the API key.", 400);
  }
  if (!res.ok) throw new TpdbError(`ThePornDB answered with an error (${res.status}).`, 502);
  try {
    return (await res.json()) as T;
  } catch {
    throw new TpdbError("ThePornDB sent an answer this app could not read.", 502);
  }
}

function toCandidate(scene: RawScene): TpdbCandidate {
  return {
    id: scene.id,
    title: scene.title,
    studio: scene.site?.name ?? null,
    date: scene.date,
    durationSeconds: scene.duration,
    image: scene.image,
    // A site lists performers under its own spelling ("Littlecaprice") and
    // links that to the main profile; the main name is the one to show.
    performers: (scene.performers ?? []).map((p) => p.parent?.name ?? p.name),
  };
}

/** Lowercase letters and digits only, so "Blacked Raw" equals "BlackedRaw". */
export function normaliseName(name: string | null | undefined): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The studio names a scene answers to: its site, and the network above it. */
function studioNames(scene: RawScene): string[] {
  const site = scene.site;
  if (!site) return [];
  return [site.name, site.network?.name, site.parent?.name]
    .filter((name): name is string => Boolean(name))
    .map(normaliseName);
}

export type SceneQuery = { studio: string | null; date: string | null; title: string };

/**
 * Scenes that might be this video, and the one to take without asking.
 *
 * The confident pick is the single candidate on the same date whose site or
 * network is the video's studio. Title alone is never enough — studios reuse
 * them — so a video without a studio and a release date has no confident
 * pick, only candidates for the owner to choose from.
 */
export async function searchTpdbScenes(
  apiKey: string,
  query: SceneQuery,
): Promise<{ candidates: TpdbCandidate[]; confidentId: string | null }> {
  const parse = [query.studio, query.date, query.title].filter(Boolean).join(" ");
  const params = new URLSearchParams({ parse, per_page: "8" });
  const body = await tpdbGet<{ data?: RawScene[] }>(apiKey, `/scenes?${params}`);
  const scenes = Array.isArray(body.data) ? body.data : [];

  let confidentId: string | null = null;
  if (query.studio && query.date) {
    const studio = normaliseName(query.studio);
    const matches = scenes.filter(
      (scene) => scene.date === query.date && studioNames(scene).includes(studio),
    );
    if (matches.length === 1) confidentId = matches[0].id;
  }
  return { candidates: scenes.map(toCandidate), confidentId };
}

/** The scene's markers, in playback order, with unusable ones dropped. */
export async function fetchTpdbMarkers(apiKey: string, sceneId: string): Promise<TpdbMarker[]> {
  const body = await tpdbGet<{ data?: RawScene }>(apiKey, `/scenes/${encodeURIComponent(sceneId)}`);
  if (!body.data) throw new TpdbError("ThePornDB has no scene with that id.", 400);
  return (body.data.markers ?? [])
    .filter((m) => typeof m.start_time === "number" && m.start_time >= 0 && m.title?.trim())
    .map((m) => ({
      title: m.title.trim(),
      startSeconds: Math.floor(m.start_time as number),
      endSeconds:
        typeof m.end_time === "number" && m.end_time > (m.start_time as number)
          ? Math.floor(m.end_time)
          : null,
    }))
    .sort((a, b) => a.startSeconds - b.startSeconds);
}
