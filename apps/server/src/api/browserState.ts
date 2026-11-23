// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import type { FastifyInstance } from "fastify";
import { serialized } from "../auth/serialize.js";
import { profileId } from "../auth/profileContext.js";
import { getProfileSetting, setProfileSetting } from "../library/profileSettings.js";

/**
 * The web app's browser-only data, kept here too so it is in every backup and
 * comes back on a new browser or after a restore: pinned items, saved and
 * recent searches, recently played, dismissed hints, a few view choices.
 * None of it can be rebuilt by rescanning the library.
 *
 * Stored per profile as one object of storage key → the string the browser
 * held, exactly as the browser held it; the server never reads inside.
 */
const KEY = "browser";
/** Which storage keys may be kept: a key outside this list is refused. */
const KEY_PATTERN = /^[a-z0-9][a-z0-9:-]{0,79}$/;
/** Generous for recents and pins; a guard against a runaway value, no more. */
const MAX_VALUE_LENGTH = 256 * 1024;

function asEntries(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (KEY_PATTERN.test(key) && typeof entry === "string") out[key] = entry;
  }
  return out;
}

export async function browserStateRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/browser-state", async (request) => {
    return { entries: asEntries(await getProfileSetting(profileId(request), KEY)) };
  });

  /** One key at a time: a string to keep, or null to forget it. */
  app.put<{ Body: { key?: unknown; value?: unknown } }>("/api/browser-state", async (request, reply) => {
    const { key, value } = request.body ?? {};
    if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
      reply.code(400);
      return { error: "key must be a storage key" };
    }
    if (value !== null && (typeof value !== "string" || value.length > MAX_VALUE_LENGTH)) {
      reply.code(400);
      return { error: "value must be a string, or null" };
    }
    const id = profileId(request);
    // Read-merge-write: two saves from one profile must not interleave.
    return serialized(`browser-state:${id}`, async () => {
      const entries = asEntries(await getProfileSetting(id, KEY));
      if (value === null) delete entries[key];
      else entries[key] = value;
      await setProfileSetting(id, KEY, entries);
      return { ok: true };
    });
  });
}
