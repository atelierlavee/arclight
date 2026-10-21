import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { activityEvents } from "../db/schema.js";
import { listActivity } from "../activity/log.js";
import { isVaultUnlocked } from "../auth/vaultUnlock.js";
import { privacyLocked } from "../auth/privacyUnlock.js";

export async function activityRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { limit?: string; type?: string } }>(
    "/api/activity",
    async (request) => ({
      events: await listActivity(
        Number(request.query.limit ?? 200),
        request.query.type || undefined,
        isVaultUnlocked(request.user?.sessionId),
      ),
    }),
  );

  // Wiping the log erases the record of everything else that happened —
  // including restores and deletions — so it needs the same proof they do.
  app.delete("/api/activity", async (request, reply) => {
    if (await privacyLocked(request, reply)) return reply;
    await db.delete(activityEvents);
    return { ok: true };
  });
}
