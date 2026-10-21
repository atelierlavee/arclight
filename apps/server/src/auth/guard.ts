import type { FastifyInstance, FastifyRequest } from "fastify";
import { parseOrigins } from "../api/webauthn.js";
import { isAuthorisedCastStream } from "./castTokens.js";
import { isApiUrl } from "./paths.js";
import { OWNER_ONLY_ROUTES, PROFILE_OPTIONAL_ROUTES, routeKey } from "./ownerRoutes.js";
import "./profileContext.js";
import { resolveSession, SESSION_COOKIE, type SessionUser } from "./sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: SessionUser;
  }
}

// Everything an unauthenticated visitor legitimately needs: the auth
// endpoints themselves, and a health check that reveals nothing. Exported so
// api/routeCoverage.test.ts can pin it: adding an entry has to be deliberate.
export const PUBLIC_API_PATHS: ReadonlySet<string> = new Set([
  "/api/auth/status",
  "/api/auth/setup",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/webauthn/login/options",
  "/api/webauthn/login",
  "/api/health",
]);

/**
 * Origins allowed to make state-changing requests besides the server itself.
 *
 * The same list WebAuthn already trusts: in dev the page is served by Vite on
 * one port and the API on another, and both are the app.
 */
const TRUSTED_ORIGINS = new Set(parseOrigins(process.env.WEBAUTHN_ORIGIN).origins);

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Whether a cross-origin page could be behind this request.
 *
 * The session cookie is SameSite=Lax, and "site" ignores the port: anything
 * else served on localhost — another dev server, a container's admin UI, a
 * page some other tool opened — is same-site and gets the cookie attached to
 * its fetch()es and form posts. Lax only stops other *sites*. Browsers send
 * Origin on every cross-origin request and every non-GET one, so comparing it
 * to the Host the request was addressed to closes that gap.
 *
 * A request with no Origin at all passes: that is curl, a script, or a test,
 * none of which carries a victim's cookie by accident.
 */
export function isForeignOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (origin === undefined) return false;
  if (TRUSTED_ORIGINS.has(origin)) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    // Includes the literal "null" a sandboxed frame or a redirect sends.
    return true;
  }
  const host = request.headers.host?.toLowerCase();
  if (host && originHost === host) return false;
  // Behind a reverse proxy that is trusted (TRUST_PROXY, see buildApp), the
  // address the browser used arrives as X-Forwarded-Host; request.host only
  // reports it when the proxy is trusted, so it cannot be forged otherwise.
  if (request.host && originHost === request.host.toLowerCase()) return false;
  return true;
}

/**
 * Requires a valid session for every /api route that isn't explicitly public.
 *
 * Deny-by-default on purpose: a new endpoint is protected the moment it's
 * added, rather than only once someone remembers to guard it. Non-API paths
 * fall through so the SPA shell can load and show a login screen — every
 * request it then makes for actual data is gated here.
 */
export function registerAuthGuard(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    if (!STATE_CHANGING.has(request.method) || !isApiUrl(request.url)) return;
    if (isForeignOrigin(request)) {
      reply.code(403).send({ error: "Cross-origin request refused", code: "bad_origin" });
    }
  });

  app.decorateRequest("profile", null);

  app.addHook("preHandler", async (request, reply) => {
    request.user = (await resolveSession(request.cookies[SESSION_COOKIE])) ?? undefined;
    request.profile = request.user?.profile ?? null;

    // Decided on the route that actually matched, which is what will run,
    // and on the normalised path as a backstop for requests no route matched
    // (the 404 handler). Either saying /api makes it /api.
    const routeUrl = request.routeOptions.url;
    if (!routeUrl?.startsWith("/api/") && !isApiUrl(request.url)) return;

    // The allow-list is matched against the route pattern rather than the
    // URL, so neither a query string nor an alternative spelling of the path
    // can line up with an entry the router would not have matched itself.
    if (routeUrl !== undefined && PUBLIC_API_PATHS.has(routeUrl)) return;

    if (!request.user) {
      // A cast token stands in for a session on exactly one stream URL; the
      // stream itself decides what that token may see (see castTokens.ts).
      if (!isAuthorisedCastStream(request.method, request.url)) {
        reply.code(401).send({ error: "Authentication required" });
      }
      return;
    }

    // Signed in, but nobody has said who is watching. Everything personal
    // depends on that answer, so only the picker and its way out work until
    // it is given. Unmatched URLs (no route) fall through to the 404.
    // HEAD is answered by the GET route, so it is judged as that GET.
    const method = request.method === "HEAD" ? "GET" : request.method;
    const key = routeUrl === undefined ? undefined : routeKey(method, routeUrl);
    if (!request.profile) {
      if (key !== undefined && !PROFILE_OPTIONAL_ROUTES.has(key)) {
        reply.code(409).send({ error: "Choose a profile first", code: "profile_required" });
      }
      return;
    }

    // Library and site management belongs to the owner profile. Declared in
    // one table (ownerRoutes.ts) rather than in each handler, for the same
    // reason this guard is deny-by-default.
    if (!request.profile.isOwner && key !== undefined && OWNER_ONLY_ROUTES.has(key)) {
      reply.code(403).send({ error: "Only the owner profile can do that", code: "owner_only" });
    }
  });
}
