// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

export type HeroSource = "recent" | "favorites" | "manual";
export type HeroSettings = { source: HeroSource; itemIds: number[] };
export type ScanSettings = { intervalMinutes: number };

export type NetworkSettings = {
  /** Whether the server answers requests that named a LAN address. */
  lanExposed: boolean;
  /** Addresses this machine can be reached on; empty when it cannot tell. */
  addresses: string[];
  /** The dev server's port — the one a phone opens. */
  port: number;
  /** True inside Docker, where the interfaces belong to the container. */
  containerised: boolean;
};
export type AppSettings = {
  hero: HeroSettings;
  scan: ScanSettings;
  /** Allowed interval choices, so the UI can't offer one the server rejects. */
  scanIntervals: number[];
  network: NetworkSettings;
};

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`Failed to load settings: ${res.status}`);
  return res.json();
}

export async function saveScanInterval(intervalMinutes: number): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scan: { intervalMinutes } }),
  });
  if (!res.ok) throw new Error(`Failed to save scan interval: ${res.status}`);
}

export async function saveHeroSettings(hero: HeroSettings): Promise<AppSettings> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hero }),
  });
  if (!res.ok) throw new Error(`Failed to save settings: ${res.status}`);
  return res.json();
}

export async function saveNetworkExposure(
  lanExposed: boolean,
): Promise<{ network: NetworkSettings }> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ network: { lanExposed } }),
  });
  if (!res.ok) throw new Error(`Failed to save network settings: ${res.status}`);
  return res.json();
}
