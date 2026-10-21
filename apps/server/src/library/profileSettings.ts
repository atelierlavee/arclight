import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { profileSettings } from "../db/schema.js";

/**
 * Which settings belong to a person rather than to the site.
 *
 * app_settings was one global key/value table. Migration 0047 split it:
 *
 *   per profile (profile_settings) — one person's preference or secret
 *     appearance    theme, density, tile shape, pinned #1 video, …
 *     privacy       discreet-mode password hash
 *     vault         vault PIN hash
 *     achievements  which trophies this profile has seen unlocked
 *
 *   global (app_settings) — the library's, managed by the owner
 *     hero, kindCovers, scan, network, categories_seeded
 *
 * A new setting has to land in one list or the other; the migration copies
 * exactly PROFILE_SETTING_KEYS into the owner's profile.
 */
export const PROFILE_SETTING_KEYS = ["appearance", "privacy", "vault", "achievements"] as const;
export type ProfileSettingKey = (typeof PROFILE_SETTING_KEYS)[number];

export async function getProfileSetting(profileId: number, key: ProfileSettingKey): Promise<unknown> {
  const [row] = await db
    .select({ value: profileSettings.value })
    .from(profileSettings)
    .where(and(eq(profileSettings.profileId, profileId), eq(profileSettings.key, key)));
  return row?.value ?? null;
}

export async function setProfileSetting(
  profileId: number,
  key: ProfileSettingKey,
  value: unknown,
): Promise<void> {
  await db
    .insert(profileSettings)
    .values({ profileId, key, value })
    .onConflictDoUpdate({
      target: [profileSettings.profileId, profileSettings.key],
      set: { value, updatedAt: new Date() },
    });
}

export async function deleteProfileSetting(profileId: number, key: ProfileSettingKey): Promise<void> {
  await db
    .delete(profileSettings)
    .where(and(eq(profileSettings.profileId, profileId), eq(profileSettings.key, key)));
}
