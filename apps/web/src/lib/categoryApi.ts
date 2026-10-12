export type Category = {
  id: number;
  slug: string;
  label: string;
  position: number;
  total: number;
  representativeItemId: number | null;
  cover: string | null;
  /** Which part of the cover the tile shows, 0-100 each. Display only. */
  coverPositionX: number;
  coverPositionY: number;
  /** Zoom percentage on top of the cover fit, 100-300. Display only. */
  coverScale: number;
};

export async function fetchCategories(): Promise<{ categories: Category[] }> {
  const res = await fetch("/api/categories");
  if (!res.ok) throw new Error(`Failed to load categories: ${res.status}`);
  return res.json();
}

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(data?.error ?? `Request failed: ${res.status}`);
  return data as T;
}

export const createCategory = (label: string) =>
  send<{ category: Category }>("/api/categories", "POST", { label });

export const renameCategory = (id: number, label: string) =>
  send<{ category: Category }>(`/api/categories/${id}`, "PATCH", { label });

export const moveCategory = (id: number, position: number) =>
  send<{ category: Category }>(`/api/categories/${id}`, "PATCH", { position });

/** Position and zoom save together — they're one framing decision. */
export const saveCategoryFraming = (
  id: number,
  framing: { coverPositionX: number; coverPositionY: number; coverScale: number }
) => send<{ category: Category }>(`/api/categories/${id}`, "PATCH", framing);

export const deleteCategory = (id: number) =>
  send<{ ok: true; movedCount: number; movedTo: string | null }>(`/api/categories/${id}`, "DELETE");

export async function uploadCategoryCover(slug: string, file: File): Promise<void> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/categories/${slug}/cover`, { method: "POST", body });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Upload failed: ${res.status}`);
  }
}

export const resetCategoryCover = (slug: string) =>
  send<{ ok: true }>(`/api/categories/${slug}/cover`, "DELETE");
