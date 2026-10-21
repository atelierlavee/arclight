import { throwIfNotOk } from "./privacyLock";

export type LibraryRoot = {
  id: number;
  libraryId: number;
  path: string;
  files: number;
  /** False for a root left over from a previous MEDIA_ROOT — unscannable. */
  reachable: boolean;
};

export type BrowseRoot = { name: string; path: string };
export type RootsResponse = {
  mediaRoot: string;
  browseRoots: BrowseRoot[];
  roots: LibraryRoot[];
};

export type BrowseResponse = {
  /** Null at the top level, where the entries are the mount points. */
  path: string | null;
  parent: string | null;
  directories: { name: string; path: string }[];
};

export async function fetchRoots(): Promise<RootsResponse> {
  const res = await fetch("/api/library/roots");
  if (!res.ok) throw new Error(`Failed to load folders: ${res.status}`);
  return res.json();
}

export async function browseFolders(dir?: string): Promise<BrowseResponse> {
  const query = dir ? `?path=${encodeURIComponent(dir)}` : "";
  const res = await fetch(`/api/library/browse${query}`);
  if (!res.ok) throw new Error(`Failed to browse: ${res.status}`);
  return res.json();
}

export async function addRoot(dirPath: string): Promise<void> {
  const res = await fetch("/api/library/roots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: dirPath }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Failed to add folder: ${res.status}`);
  }
}

/**
 * What a cleanup would remove, or has removed.
 *
 * Items belonging to no watched folder, plus the performers, studios, albums
 * and series that only those items used.
 */
export type RemovableData = {
  items: number;
  videos: number;
  photos: number;
  performers: number;
  studios: number;
  albums: number;
  series: number;
};

export const cleanupQueryKey = ["library-cleanup"] as const;

export async function fetchRemovableData(): Promise<RemovableData> {
  const res = await fetch("/api/library/cleanup");
  if (!res.ok) throw new Error(`Failed to check: ${res.status}`);
  return ((await res.json()) as { removable: RemovableData }).removable;
}

export async function purgeRemovableData(): Promise<RemovableData> {
  const res = await fetch("/api/library/cleanup", { method: "POST" });
  await throwIfNotOk(res, "Failed to clean up");
  return ((await res.json()) as { removed: RemovableData }).removed;
}

/**
 * @param deleteData Also destroy the folder's items and their metadata.
 *   Left off, they are hidden instead, and adding the folder back restores
 *   everything.
 */
export async function removeRoot(id: number, deleteData = false): Promise<void> {
  const res = await fetch(
    `/api/library/roots/${id}${deleteData ? "?deleteData=true" : ""}`,
    { method: "DELETE" },
  );
  await throwIfNotOk(res, "Failed to remove folder");
}
