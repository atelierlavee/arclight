export const TIERS = ["S", "A", "B", "C", "D"] as const;
export type Tier = (typeof TIERS)[number];
export type TierKind = "performer" | "video";

export type TierEntry = {
  id: number;
  /** Performers. */
  name?: string;
  hasImage?: boolean;
  hasBanner?: boolean;
  representativeItemId?: number | null;
  /** Videos. */
  title?: string;
  thumbnailFile?: string | null;
  durationSeconds?: number | null;
};

export type TierBoard = { rows: Record<Tier, TierEntry[]>; pool: TierEntry[] };

/** Where a tile can go: a tier, or back to the unranked pool. */
export type TierPlace = Tier | "pool";

export function emptyRows(): Record<Tier, TierEntry[]> {
  return { S: [], A: [], B: [], C: [], D: [] };
}

/** The server's flat `ranked` list (already in order) as rows. */
export function boardFrom(ranked: (TierEntry & { tier: Tier })[], pool: TierEntry[]): TierBoard {
  const rows = emptyRows();
  for (const { tier, ...entry } of ranked) {
    if (rows[tier]) rows[tier].push(entry);
  }
  return { rows, pool };
}

/**
 * Moves one tile to `to`, before the tile `beforeId` (or to the end when it
 * is absent or is the tile itself). Returns a new board; the old one is left
 * as it was, so React sees the change.
 */
export function moveEntry(board: TierBoard, id: number, to: TierPlace, beforeId?: number): TierBoard {
  let moving: TierEntry | undefined;
  const take = (list: TierEntry[]) =>
    list.filter((entry) => {
      if (entry.id !== id) return true;
      moving = entry;
      return false;
    });
  const rows = emptyRows();
  for (const tier of TIERS) rows[tier] = take(board.rows[tier]);
  const pool = take(board.pool);
  if (!moving) return board;

  const target = to === "pool" ? pool : rows[to];
  const at = beforeId === undefined || beforeId === id ? -1 : target.findIndex((entry) => entry.id === beforeId);
  if (at === -1) target.push(moving);
  else target.splice(at, 0, moving);
  return { rows, pool };
}

/** What PUT /api/tiers/:kind takes: each tier's ids in order. */
export function boardPayload(board: TierBoard): Record<Tier, number[]> {
  return Object.fromEntries(TIERS.map((tier) => [tier, board.rows[tier].map((entry) => entry.id)])) as Record<
    Tier,
    number[]
  >;
}
