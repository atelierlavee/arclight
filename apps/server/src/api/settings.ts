import { serialized } from "../auth/serialize.js";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { appSettings } from "../db/schema.js";
import { restartScanSchedule } from "../scanner/schedule.js";
import { forgetLanExposure, inContainer, lanAddresses, lanPort } from "../net/lan.js";
import { isId } from "./mediaItemQueries.js";

/** More than any hero carousel shows; bounds what one save can store. */
const MAX_HERO_ITEMS = 100;

export type HeroSource = "recent" | "favorites" | "manual";

export type HeroSettings = {
  source: HeroSource;
  /** Only meaningful when source is "manual"; order here is display order. */
  itemIds: number[];
};

const HERO_KEY = "hero";
const KIND_COVERS_KEY = "kindCovers";
const SCAN_KEY = "scan";
const NETWORK_KEY = "network";

// Minutes between automatic scans. 0 means off. Kept as an allow-list rather
// than a free number so a hand-edited row can't set a 10-second interval and
// leave the scanner permanently busy.
export const SCAN_INTERVALS = [0, 5, 15, 30, 60, 180] as const;

export type ScanSettings = { intervalMinutes: number };

const DEFAULT_SCAN: ScanSettings = { intervalMinutes: 15 };

export async function getScanSettings(): Promise<ScanSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, SCAN_KEY));
  const value = row?.value as Partial<ScanSettings> | null;
  const minutes = value?.intervalMinutes;
  // Re-validated on read, same discipline as the hero settings.
  return SCAN_INTERVALS.includes(minutes as (typeof SCAN_INTERVALS)[number])
    ? { intervalMinutes: minutes as number }
    : DEFAULT_SCAN;
}

export async function setScanSettings(intervalMinutes: number): Promise<ScanSettings> {
  const value: ScanSettings = SCAN_INTERVALS.includes(
    intervalMinutes as (typeof SCAN_INTERVALS)[number]
  )
    ? { intervalMinutes }
    : DEFAULT_SCAN;

  await db
    .insert(appSettings)
    .values({ key: SCAN_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  return value;
}

/**
 * Whether the app answers requests that arrived at a LAN address.
 *
 * Defaults to on, so adding this feature does not silently cut off a phone
 * that was working five minutes ago. Turning it off is a deliberate act.
 */
export type NetworkSettings = { lanExposed: boolean };

const DEFAULT_NETWORK: NetworkSettings = { lanExposed: true };

export async function getNetworkSettings(): Promise<NetworkSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, NETWORK_KEY));
  const value = row?.value as Partial<NetworkSettings> | null;
  // Re-validated on read, same discipline as the scan settings: a hand-edited
  // row that is not a boolean must not decide whether the door is open.
  return typeof value?.lanExposed === "boolean"
    ? { lanExposed: value.lanExposed }
    : DEFAULT_NETWORK;
}

export async function setNetworkSettings(lanExposed: boolean): Promise<NetworkSettings> {
  const value: NetworkSettings = { lanExposed: Boolean(lanExposed) };
  await db
    .insert(appSettings)
    .values({ key: NETWORK_KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  return value;
}

/** Uploaded cover filename per category, when one has been set. */
export type KindCovers = Partial<Record<string, string>>;

/**
 * The stored covers, as a prototype-free map holding only string filenames.
 *
 * Callers index this with a category slug from a URL. On a plain object,
 * `covers["constructor"]` is Object's constructor function, not undefined —
 * which reached the file streamer as a "filename". With no prototype, and
 * non-string entries from a hand-edited row dropped, a lookup is either a
 * filename or undefined.
 */
export async function getKindCovers(): Promise<KindCovers> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KIND_COVERS_KEY));
  const value = row?.value as Record<string, unknown> | null;
  const covers: KindCovers = Object.create(null);
  if (!value || typeof value !== "object" || Array.isArray(value)) return covers;
  for (const [kind, fileName] of Object.entries(value)) {
    if (typeof fileName === "string" && fileName) covers[kind] = fileName;
  }
  return covers;
}

/** A category's cover filename, or undefined — never an inherited property. */
export function kindCoverFor(covers: KindCovers, kind: string): string | undefined {
  const fileName = Object.hasOwn(covers, kind) ? covers[kind] : undefined;
  return typeof fileName === "string" && fileName ? fileName : undefined;
}

export function setKindCover(kind: string, fileName: string | null): Promise<KindCovers> {
  // One JSON row holds every cover, so concurrent read-modify-writes would
  // lose one of the entries.
  return serialized("kind-covers", () => writeKindCover(kind, fileName));
}

async function writeKindCover(kind: string, fileName: string | null): Promise<KindCovers> {
  const current = await getKindCovers();
  const next: KindCovers = Object.assign(Object.create(null), current);
  if (fileName) next[kind] = fileName;
  else delete next[kind];

  await db
    .insert(appSettings)
    .values({ key: KIND_COVERS_KEY, value: next })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: next, updatedAt: new Date() },
    });
  return next;
}

const DEFAULT_HERO: HeroSettings = { source: "recent", itemIds: [] };

const HERO_SOURCES: HeroSource[] = ["recent", "favorites", "manual"];

export async function getHeroSettings(): Promise<HeroSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, HERO_KEY));
  if (!row) return DEFAULT_HERO;

  // Stored values are jsonb the app wrote, but a hand-edited row shouldn't be
  // able to break the homepage, so everything is re-validated on read.
  const value = row.value as Partial<HeroSettings> | null;
  const source = HERO_SOURCES.includes(value?.source as HeroSource)
    ? (value!.source as HeroSource)
    : DEFAULT_HERO.source;
  // isId, not just Number.isInteger: these end up in an IN list against an
  // integer column, where an id past its range is a query error.
  const itemIds = Array.isArray(value?.itemIds)
    ? value!.itemIds.filter(isId).slice(0, MAX_HERO_ITEMS)
    : [];

  return { source, itemIds };
}

export async function settingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings", async () => ({
    hero: await getHeroSettings(),
    scan: await getScanSettings(),
    scanIntervals: SCAN_INTERVALS,
    network: {
      ...(await getNetworkSettings()),
      addresses: lanAddresses(),
      // The port a phone connects to: Vite's in development, the server's
      // own in production. See lanPort().
      port: lanPort(),
      // Lets the settings screen explain why it has no address to show
      // rather than leaving an empty space.
      containerised: inContainer(),
    },
  }));

  app.patch<{
    Body: {
      hero?: Partial<HeroSettings>;
      scan?: Partial<ScanSettings>;
      network?: Partial<NetworkSettings>;
    };
  }>(
    "/api/settings",
    async (request, reply) => {
      const body = request.body;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        reply.code(400);
        return { error: "Nothing to update" };
      }

      // Every section in the body is applied and answered, not just the first.
      // All validated before any is written, so a bad section can't leave the
      // others half-applied.
      if (
        body.network?.lanExposed !== undefined &&
        // Rejected rather than coerced: Boolean("false") is true, and this
        // setting decides whether the server answers the LAN at all.
        typeof body.network.lanExposed !== "boolean"
      ) {
        reply.code(400);
        return { error: "network.lanExposed must be a boolean" };
      }

      const incoming = body.hero;
      const touchesHero = incoming !== undefined;
      if (touchesHero) {
        if (!incoming || typeof incoming !== "object") {
          reply.code(400);
          return { error: "Nothing to update" };
        }
        if (incoming.source !== undefined && !HERO_SOURCES.includes(incoming.source as HeroSource)) {
          reply.code(400);
          return { error: `hero.source must be one of ${HERO_SOURCES.join(", ")}` };
        }
        if (incoming.itemIds !== undefined && !Array.isArray(incoming.itemIds)) {
          reply.code(400);
          return { error: "hero.itemIds must be an array" };
        }
      }

      const touchesNetwork = body.network?.lanExposed !== undefined;
      const touchesScan = body.scan?.intervalMinutes !== undefined;
      if (!touchesNetwork && !touchesScan && !touchesHero) {
        reply.code(400);
        return { error: "Nothing to update" };
      }

      const result: Record<string, unknown> = {};

      if (touchesNetwork) {
        const network = await setNetworkSettings(body.network!.lanExposed as boolean);
        // Pushed into the guard's cache rather than just clearing it, so the
        // very next request is judged by the new value with no extra query.
        forgetLanExposure(network.lanExposed);
        result.network = {
          ...network,
          addresses: lanAddresses(),
          port: lanPort(),
          containerised: inContainer(),
        };
      }

      if (touchesScan) {
        // An interval off the allow-list is coerced to the default by
        // setScanSettings, deliberately (see routes.test.ts).
        result.scan = await setScanSettings(body.scan!.intervalMinutes as number);
        // Applied immediately rather than at next boot — changing the interval
        // and having nothing happen for an hour would read as broken.
        await restartScanSchedule();
      }

      if (touchesHero) {
        const current = await getHeroSettings();
        const source = HERO_SOURCES.includes(incoming!.source as HeroSource)
          ? (incoming!.source as HeroSource)
          : current.source;
        const itemIds = Array.isArray(incoming!.itemIds)
          ? [...new Set(incoming!.itemIds.filter(isId))].slice(0, MAX_HERO_ITEMS)
          : current.itemIds;

        const value: HeroSettings = { source, itemIds };

        await db
          .insert(appSettings)
          .values({ key: HERO_KEY, value })
          .onConflictDoUpdate({
            target: appSettings.key,
            set: { value, updatedAt: new Date() },
          });
        result.hero = value;
      }

      return result;
    }
  );
}

/** Ids to feature, in display order — empty means "fall back to recent". */
export async function heroItemIds(): Promise<number[] | null> {
  const hero = await getHeroSettings();
  if (hero.source !== "manual") return null;
  return hero.itemIds;
}

export { inArray };
