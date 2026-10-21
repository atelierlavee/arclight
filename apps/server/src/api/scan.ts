import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { scanJobs } from "../db/schema.js";
import { isScanRunning, startScan } from "../scanner/pipeline.js";

export async function scanRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/scan", async (_request, reply) => {
    if (isScanRunning()) {
      reply.code(409);
      return { error: "A scan is already running" };
    }

    // startScan re-checks synchronously and throws if another request won
    // the race since the check above; that is still a 409, not a 500.
    let id: number;
    try {
      id = await startScan();
    } catch (err) {
      if (isScanRunning()) {
        reply.code(409);
        return { error: "A scan is already running" };
      }
      throw err;
    }
    reply.code(202);
    return { id };
  });

  /**
   * The most recent scan, for the "What Changed" summary (§15).
   *
   * Registered before the `:id` route, and a static segment besides, so
   * "latest" is never parsed as a job id. A client that had to know the id
   * would have to have been the one that started the scan, which the summary
   * on a freshly-loaded page never was.
   */
  app.get("/api/scan/latest", async () => {
    const [job] = await db
      .select()
      .from(scanJobs)
      .orderBy(desc(scanJobs.id))
      .limit(1);
    // Null rather than a 404: "no scan has ever run" is an ordinary state on
    // a new install, not a failed lookup.
    return { job: job ?? null };
  });

  app.get<{ Params: { id: string } }>("/api/scan/:id", async (request, reply) => {
    const id = Number(request.params.id);
    const [job] = await db.select().from(scanJobs).where(eq(scanJobs.id, id));
    if (!job) {
      reply.code(404);
      return { error: "Not found" };
    }
    return job;
  });
}
