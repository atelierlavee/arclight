import { serialized } from "../auth/serialize.js";
import { rm } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { privacyLocked } from "../auth/privacyUnlock.js";
import { createBackup, listBackups, resolveBackupPath } from "../backup/create.js";
import { RestoreError, restoreBackup } from "../backup/restore.js";
import { verifyBackup } from "../backup/verify.js";
import { readRestoreMarker } from "../backup/restoreState.js";
import { streamFile } from "../media/streamer.js";

/**
 * Backups, behind the privacy gate wherever it matters.
 *
 * Restore, delete and download all refuse unless this session has proved the
 * privacy credential (`privacyLocked`, shared with the missing-videos
 * manager): a dialog in the UI protects nothing while the endpoint behind it
 * is one request away. Restoring is the most destructive thing the app can
 * do; deleting a backup throws away the way back from it; and downloading one
 * hands over the entire library — every hidden item and vault entry
 * included — in a single file.
 *
 * With nothing configured there is nothing to prove, and the gate
 * deliberately lets the request through — which is what makes a fresh clone
 * recoverable, since a brand-new install has no privacy credential to offer.
 */
export async function backupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/backups/restore-state", async () => ({
    interrupted: await readRestoreMarker(),
  }));

  app.post<{ Params: { name: string } }>(
    "/api/backups/:name/restore",
    async (request, reply) => {
      if (await privacyLocked(request, reply)) return reply;
      try {
        return await restoreBackup(request.params.name);
      } catch (err) {
        const status = err instanceof RestoreError ? err.status : 500;
        const message = err instanceof Error ? err.message : String(err);
        // The message is the whole UI here — it is the only account the user
        // gets of whether their library still exists.
        reply.code(status);
        return { error: message };
      }
    },
  );

  app.get("/api/backups", async () => ({ backups: await listBackups() }));

  /**
   * Checks that an archive is actually restorable (§18).
   *
   * POST rather than GET because it costs real work — a full extract and a
   * hash of every member — and because a GET invites a prefetch doing it
   * uninvited. It changes nothing and returns only pass/fail checks, not the
   * archive's contents, so it is not behind the privacy gate.
   */
  app.post<{ Params: { name: string } }>(
    "/api/backups/:name/verify",
    async (request, reply) => {
      // One at a time: each verify extracts the whole archive and hashes it,
      // and repeated calls would otherwise run that in parallel.
      const result = await serialized("backup-verify", () => verifyBackup(request.params.name));
      // 200 either way. A backup that fails verification is a successful
      // check with a bad answer, and an error status would make the client
      // treat the finding as a failure to look.
      reply.code(200);
      return result;
    },
  );

  app.post("/api/backups", async (_request, reply) => {
    try {
      const backup = await createBackup();
      return { backup };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 409 for the concurrency guard, 500 for anything genuinely broken —
      // the UI shows the message either way, so it needs to be readable.
      reply.code(message.includes("already running") ? 409 : 500);
      return { error: message };
    }
  });

  app.get<{ Params: { name: string } }>(
    "/api/backups/:name",
    { exposeHeadRoute: false },
    async (request, reply) => {
      if (await privacyLocked(request, reply)) return reply;
      const filePath = resolveBackupPath(request.params.name);
      if (!filePath) {
        reply.code(400);
        return { error: "Invalid backup name" };
      }
      reply.header("Content-Disposition", `attachment; filename="${request.params.name}"`);
      await streamFile(reply, filePath, "application/gzip", request.headers.range, false);
    }
  );

  app.delete<{ Params: { name: string } }>("/api/backups/:name", async (request, reply) => {
    if (await privacyLocked(request, reply)) return reply;
    const filePath = resolveBackupPath(request.params.name);
    if (!filePath) {
      reply.code(400);
      return { error: "Invalid backup name" };
    }
    await rm(filePath, { force: true });
    return { ok: true };
  });
}
