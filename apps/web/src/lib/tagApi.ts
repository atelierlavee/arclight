export type TagRow = {
  id: number;
  name: string;
  color: string | null;
  description: string | null;
  /** Items carrying this tag directly, not through a tag under it. */
  itemCount: number;
  /** The tags this one sits under; a tag may have several. */
  parentIds: number[];
  /** Other spellings that resolve to this tag when typed. */
  aliases: string[];
};

export async function fetchTags(): Promise<{ tags: TagRow[] }> {
  const res = await fetch("/api/tags");
  if (!res.ok) throw new Error(`Failed to load tags: ${res.status}`);
  return res.json();
}

/** Each list sent replaces the old one. The server's message is passed on. */
export async function saveTag(
  id: number,
  patch: { description?: string | null; parentIds?: number[]; aliases?: string[] },
): Promise<void> {
  const res = await fetch(`/api/tags/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Failed to save tag: ${res.status}`);
  }
}

/**
 * Every tag below `id`, not including it — the ones it cannot take as a
 * parent, since that would put it underneath itself.
 */
export function descendantIds(tags: TagRow[], id: number): Set<number> {
  const below = new Set<number>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const tag of tags) {
      if (tag.parentIds.includes(current) && !below.has(tag.id)) {
        below.add(tag.id);
        queue.push(tag.id);
      }
    }
  }
  return below;
}
