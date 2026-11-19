/** More than four and each picture is too small to be worth watching. */
export const MULTIVIEW_MAX = 4;

/** The ids in a `?ids=` value: whole, positive, distinct, at most four. */
export function parseMultiviewIds(value: string | undefined): number[] {
  const ids: number[] = [];
  for (const part of (value ?? "").split(",")) {
    const id = Number(part.trim());
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
    if (ids.length === MULTIVIEW_MAX) break;
  }
  return ids;
}
