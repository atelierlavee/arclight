import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";

/**
 * Migration 0047 (profiles) against a database that predates it.
 *
 * Every other suite starts from an empty schema, where the backfill has
 * nothing to do. This one migrates a scratch database to 0046, fills it the
 * way a single-user install would be, then applies 0047 and checks that the
 * owner profile now holds everything that used to be global.
 */

const MIGRATIONS = path.resolve(import.meta.dirname, "migrations");
const SCRATCH_DB = "media_test_m0047";

function urlFor(database: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${database}`;
  return url.toString();
}

/** A copy of the migrations folder whose journal stops before `stopAt`. */
async function migrationsUpTo(stopAt: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "migrations-"));
  await cp(MIGRATIONS, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
    entries: { tag: string }[];
  };
  const cut = journal.entries.findIndex((entry) => entry.tag.startsWith(stopAt));
  journal.entries = journal.entries.slice(0, cut);
  await writeFile(journalPath, JSON.stringify(journal));
  return dir;
}

let admin: Client;
let pool: Pool;
let partial: string;

beforeAll(async () => {
  admin = new Client({ connectionString: process.env.DATABASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${SCRATCH_DB}`);
  pool = new Pool({ connectionString: urlFor(SCRATCH_DB) });
  partial = await migrationsUpTo("0047_");
});

afterAll(async () => {
  await pool?.end();
  await admin?.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
  await admin?.end();
  if (partial) await rm(partial, { recursive: true, force: true });
});

describe("migration 0047 backfill", () => {
  it("gives an existing single-user install an owner profile holding all its data", async () => {
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: partial });

    // A single-user library as it stood before profiles.
    const q = (text: string, values: unknown[] = []) => pool.query(text, values);
    const [{ id: userId }] = (
      await q(`insert into users (username, password_hash) values ('vivek', 'x:y') returning id`)
    ).rows;
    await q(`insert into sessions (id, user_id, expires_at) values ('s1', $1, now() + interval '1 day')`, [userId]);
    await q(
      `insert into webauthn_credentials (id, user_id, public_key, label) values ('pk', $1, 'AQID', 'Mac')`,
      [userId],
    );
    await q(`insert into media_item_types (name) values ('video')`);
    await q(`insert into libraries (name) values ('L')`);
    const item = async (title: string, extra: string) =>
      (
        await q(
          `insert into media_items (library_id, item_type_id, title${extra ? ", " + extra.split("=")[0] : ""})
           values (1, 1, $1${extra ? ", " + extra.split("=")[1] : ""}) returning id`,
          [title],
        )
      ).rows[0].id as number;
    const fav = await item("Fav", "is_favorite=true");
    const rated = await item("Rated", "rating=4");
    const hidden = await item("Hidden", "hidden_at=now()");
    const plain = await item("Plain", "");
    await q(`insert into performers (name, is_favorite) values ('Loved', true), ('Other', false)`);
    await q(`insert into playback_states (media_item_id, position_seconds) values ($1, 30)`, [plain]);
    await q(`insert into watch_log (media_item_id, hour, seconds) values ($1, date_trunc('hour', now()), 60)`, [plain]);
    await q(`insert into playback_heatmap (media_item_id, bucket) values ($1, 2)`, [plain]);
    await q(`insert into bookmarks (media_item_id, position_seconds) values ($1, 10)`, [plain]);
    await q(`insert into app_settings (key, value) values
      ('appearance', '{"tileSizePercent": 70}'), ('privacy', '{"passwordHash": "h"}'),
      ('vault', '{"pinHash": "p"}'), ('achievements', '{"unlocked": {}}'),
      ('hero', '{"source": "recent"}'), ('scan', '{"intervalMinutes": 15}')`);

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const profiles = (await q(`select * from profiles`)).rows;
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ user_id: userId, name: "vivek", is_owner: true, pin_hash: null });
    const owner = profiles[0].id;

    // Signed-in sessions carry on as the owner; passkeys are the owner's.
    expect((await q(`select profile_id from sessions`)).rows).toEqual([{ profile_id: owner }]);
    expect((await q(`select profile_id from webauthn_credentials`)).rows).toEqual([{ profile_id: owner }]);

    // History is the owner's.
    for (const table of ["playback_states", "watch_log", "playback_heatmap", "bookmarks"]) {
      expect((await q(`select profile_id from ${table}`)).rows, table).toEqual([{ profile_id: owner }]);
    }

    // Per-item state moved, only for items that had any.
    const state = (
      await q(`select media_item_id, is_favorite, rating, hidden_at is not null as hidden
               from profile_item_state where profile_id = $1 order by media_item_id`, [owner])
    ).rows;
    expect(state).toEqual([
      { media_item_id: fav, is_favorite: true, rating: null, hidden: false },
      { media_item_id: rated, is_favorite: false, rating: 4, hidden: false },
      { media_item_id: hidden, is_favorite: false, rating: null, hidden: true },
    ]);
    expect(
      (await q(`select p.name from profile_performer_state s join performers p on p.id = s.performer_id
                where s.profile_id = $1 and s.is_favorite`, [owner])).rows,
    ).toEqual([{ name: "Loved" }]);

    // The old columns are gone.
    const columns = (
      await q(`select table_name, column_name from information_schema.columns
               where (table_name = 'media_items' and column_name in ('is_favorite', 'rating', 'hidden_at'))
                  or (table_name = 'performers' and column_name = 'is_favorite')`)
    ).rows;
    expect(columns).toEqual([]);

    // Personal settings moved; the site's stayed.
    expect(
      (await q(`select key from profile_settings where profile_id = $1 order by key`, [owner])).rows.map((r) => r.key),
    ).toEqual(["achievements", "appearance", "privacy", "vault"]);
    expect((await q(`select key from app_settings order by key`)).rows.map((r) => r.key)).toEqual(["hero", "scan"]);
  }, 60_000);
});
