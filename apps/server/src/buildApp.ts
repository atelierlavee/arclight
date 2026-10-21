import { existsSync } from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance, type RouteOptions } from "fastify";
import fastifyStatic from "@fastify/static";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { albumRoutes } from "./api/albums.js";
import { activityRoutes } from "./api/activity.js";
import { appearanceRoutes } from "./api/appearance.js";
import { backupRoutes } from "./api/backups.js";
import { categoryRoutes } from "./api/categories.js";
import { collectionRoutes } from "./api/collections.js";
import { folderRoutes } from "./api/folders.js";
import { libraryRoutes } from "./api/library.js";
import { mediaItemRoutes } from "./api/mediaItems.js";
import { kindRoutes } from "./api/kinds.js";
import { discoveryRoutes } from "./api/discovery.js";
import { mediaItemDetailRoutes } from "./api/mediaItemDetail.js";
import { mediaItemEditRoutes } from "./api/mediaItemEdit.js";
import { mediaRoutes } from "./api/media.js";
import { playbackRoutes } from "./api/playback.js";
import { privacyRoutes } from "./api/privacy.js";
import { scanRoutes } from "./api/scan.js";
import { settingsRoutes } from "./api/settings.js";
import { missingRoutes } from "./api/missing.js";
import { statsRoutes } from "./api/stats.js";
import { seriesRoutes } from "./api/series.js";
import { studioRoutes } from "./api/studios.js";
import { performerRoutes } from "./api/performers.js";
import { tagRoutes } from "./api/tags.js";
import { webauthnRoutes } from "./api/webauthn.js";
import { authRoutes } from "./api/auth.js";
import { bookmarkRoutes } from "./api/bookmarks.js";
import { storageRoutes } from "./api/storage.js";
import { castRoutes } from "./api/cast.js";
import { inboxRoutes } from "./api/inbox.js";
import { vaultRoutes } from "./api/vault.js";
import { insightsRoutes } from "./api/insights.js";
import { achievementRoutes } from "./api/achievements.js";
import { profileRoutes } from "./api/profiles.js";
import { registerAuthGuard } from "./auth/guard.js";
import { decodedPath, isApiUrl } from "./auth/paths.js";
import { registerLanGuard } from "./net/lan.js";
import { isRestoring } from "./backup/restoreState.js";
import { checkDbConnection } from "./db/client.js";
import { MAX_UPLOAD_BYTES } from "./media/performerImages.js";

/**
 * Whether to believe X-Forwarded-* headers, from the TRUST_PROXY env var.
 *
 * Off unless asked for. Trusting them when nothing in front of the server
 * sets them lets any client claim any address — which would hand every
 * caller a fresh login-attempt budget per request and let a plain-http
 * request claim to be https. Behind a reverse proxy that terminates TLS it is
 * worth turning on, so the session cookie gets its Secure flag and the login
 * throttle sees real client addresses: "true" trusts every hop, a number
 * trusts that many hops, anything else is passed through as Fastify's list of
 * trusted proxy addresses/CIDRs (e.g. "127.0.0.1,172.18.0.0/16").
 *
 * The LAN switch (net/lan.ts) reads the raw Host header, not request.host,
 * so this does not change what it decides.
 */
export function trustProxySetting(
  value: string | undefined,
): boolean | string | ((address: string, hop: number) => boolean) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "false" || trimmed === "0") return false;
  if (trimmed === "true") return true;
  if (/^\d+$/.test(trimmed)) {
    // Fastify's typings only take the hop count in function form.
    const hops = Number(trimmed);
    return (_address, hop) => hop < hops;
  }
  return trimmed;
}

/**
 * Builds the server without starting it or touching the database schema.
 *
 * Separate from the entry point so tests can drive the real routes in-process
 * with `app.inject()` — no port, no network, and no risk of testing a mock
 * that behaves like the mock rather than like the app. Migrations, seeding and
 * the scan schedule are the entry point's job, because a test wants to control
 * when those happen.
 */
export async function buildApp({
  logger = false,
  onRoute,
}: {
  logger?: boolean;
  /**
   * Sees every route as it is registered. For tests that sweep the whole
   * API (api/routeCoverage.test.ts), so a route nobody wrote a test for is
   * still checked against the rules every route has to follow.
   */
  onRoute?: (route: RouteOptions) => void;
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger, trustProxy: trustProxySetting(process.env.TRUST_PROXY) });
  // First, so no route registered below can be missed.
  if (onRoute) app.addHook("onRoute", onRoute);

  await app.register(cookie);

  // Ahead of the auth guard, deliberately. That guard resolves a session by
  // querying the database on every single request (auth/guard.ts), so a gate
  // registered after it would be running behind a query against the very
  // database being dropped and recreated. Health stays reachable so something
  // outside can still tell the process is alive.
  app.addHook("onRequest", async (request, reply) => {
    if (!isRestoring()) return;
    // Decoded first: this runs before routing, and the router will happily
    // send `/%61pi/...` to an /api handler that must not run mid-restore.
    if (!isApiUrl(request.url)) return;
    if (decodedPath(request.url) === "/api/health") return;
    reply.code(503).send({
      error: "A backup is being restored — the library is briefly unavailable",
      code: "restoring",
    });
  });

  // Registered before any route so the guard sees every /api request. Routes
  // added later are protected automatically — deny-by-default.
  // Before the auth guard: a device that is not allowed to reach this server
  // at all should not get as far as being told its password is wrong.
  registerLanGuard(app);
  registerAuthGuard(app);

  // Performer artwork uploads. The size cap is enforced here rather than in
  // the route so an oversized body is rejected while streaming, before it can
  // be buffered into memory.
  await app.register(multipart, {
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  });

  await app.register(swagger, {
    openapi: { info: { title: "Arc Light API", version: "0.0.1" } },
  });
  await app.register(swaggerUi, { routePrefix: "/api/docs" });

  app.get(
    "/api/health",
    {
      schema: {
        response: {
          200: {
            type: "object",
            properties: { status: { type: "string" }, db: { type: "boolean" } },
          },
        },
      },
    },
    async () => {
      const dbOk = await checkDbConnection();
      return { status: "ok", db: dbOk };
    },
  );

  await app.register(authRoutes);
  await app.register(profileRoutes);
  await app.register(scanRoutes);
  await app.register(mediaItemRoutes);
  await app.register(kindRoutes);
  await app.register(discoveryRoutes);
  await app.register(mediaItemDetailRoutes);
  await app.register(mediaItemEditRoutes);
  await app.register(mediaRoutes);
  await app.register(tagRoutes);
  await app.register(appearanceRoutes);
  await app.register(performerRoutes);
  await app.register(privacyRoutes);
  await app.register(webauthnRoutes);
  await app.register(studioRoutes);
  await app.register(collectionRoutes);
  await app.register(folderRoutes);
  await app.register(playbackRoutes);
  await app.register(statsRoutes);
  await app.register(missingRoutes);
  await app.register(seriesRoutes);
  await app.register(settingsRoutes);
  await app.register(libraryRoutes);
  await app.register(backupRoutes);
  await app.register(categoryRoutes);
  await app.register(albumRoutes);
  await app.register(activityRoutes);
  await app.register(bookmarkRoutes);
  await app.register(storageRoutes);
  await app.register(castRoutes);
  await app.register(inboxRoutes);
  await app.register(vaultRoutes);
  await app.register(insightsRoutes);
  await app.register(achievementRoutes);

  // In the production Docker image the built frontend is copied to ../web-dist
  // (see Dockerfile). In local dev that directory doesn't exist — the Vite dev
  // server handles the frontend instead, proxying /api to this server.
  const webDistPath = path.resolve(import.meta.dirname, "../web-dist");
  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, { root: webDistPath });

    app.setNotFoundHandler((request, reply) => {
      if (isApiUrl(request.url)) {
        reply.code(404).send({ error: "Not Found" });
        return;
      }
      reply.sendFile("index.html");
    });
  }

  return app;
}
