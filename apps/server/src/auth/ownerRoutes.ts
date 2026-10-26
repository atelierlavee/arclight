/**
 * Routes only the owner profile may use, as "METHOD /route/pattern".
 *
 * Central and declarative on purpose, like the guard's public allow-list: a
 * per-handler `if (!isOwner)` is one forgotten line away from a housemate's
 * profile deleting library folders. The guard matches these against the
 * route pattern (request.routeOptions.url), so a query string or an
 * alternative spelling of the path cannot slip past an entry.
 *
 * The rule of thumb: the owner manages the library and the site; every
 * profile manages its own history, favourites, ratings, bookmarks, vault,
 * privacy password and appearance. api/ownerRoutes.test.ts makes every
 * non-GET route appear either here or in PROFILE_ROUTES with a reason, so a
 * new route cannot be added without someone deciding which it is.
 */
export const OWNER_ONLY_ROUTES: ReadonlySet<string> = new Set([
  // Account — one login shared by every profile, so the owner holds it.
  "PATCH /api/auth/account",
  "POST /api/auth/password",

  // Activity log: library-wide history, and it names what everyone did.
  "GET /api/activity",
  "DELETE /api/activity",

  // Backups hold every profile's data; restoring replaces all of it.
  "GET /api/backups",
  "GET /api/backups/:name",
  "POST /api/backups",
  "DELETE /api/backups/:name",
  "POST /api/backups/:name/restore",
  "POST /api/backups/:name/verify",

  // Folders, scans, cleanup, cache, missing manager.
  "POST /api/library/roots",
  "DELETE /api/library/roots/:id",
  "GET /api/library/cleanup",
  "POST /api/library/cleanup",
  "GET /api/library/cache",
  "POST /api/library/cache/clear",
  "POST /api/scan",
  "GET /api/missing",
  "POST /api/missing/forget",
  "POST /api/missing/forget-all",

  // Inbox triage is library-wide state (media_items.triaged_at).
  "POST /api/inbox/triage",
  "POST /api/inbox/triage-all",

  // Site settings: hero, scan interval, LAN exposure.
  "PATCH /api/settings",

  // Metadata and artwork.
  "PUT /api/media-items/:id/performers",
  "PUT /api/media-items/:id/tags",
  "PATCH /api/tags/:id",
  "POST /api/studios",
  "PATCH /api/studios/:id",
  "POST /api/media-items/:id/thumbnail",
  "DELETE /api/media-items/:id/thumbnail",
  "POST /api/folders",
  "PATCH /api/albums/:id",
  "POST /api/series",
  "DELETE /api/performers/:id",
  "POST /api/performers/:id/image",
  "DELETE /api/performers/:id/image",
  "POST /api/categories",
  "PATCH /api/categories/:id",
  "DELETE /api/categories/:id",
  "POST /api/categories/:slug/cover",
  "DELETE /api/categories/:slug/cover",
  "POST /api/kinds/:kind/cover",
  "DELETE /api/kinds/:kind/cover",

  // Collections are shared; the owner curates them.
  "POST /api/collections",
  "DELETE /api/collections/:id",
  "POST /api/collections/:id/items",
  "DELETE /api/collections/:id/items/:mediaItemId",
  "PUT /api/collections/:id/items/reorder",

  // Profile management.
  "POST /api/profiles",
  "DELETE /api/profiles/:id",
  "POST /api/profiles/:id/reset-secrets",
]);

/**
 * Non-GET routes every profile may use, each with why. Not consulted by the
 * guard (anything absent from OWNER_ONLY_ROUTES is allowed); it exists so
 * the classification test can tell "decided: per profile" from "nobody
 * thought about it".
 */
export const PROFILE_ROUTES: Readonly<Record<string, string>> = {
  "POST /api/auth/setup": "public: first-run setup, before any profile exists",
  "POST /api/auth/login": "public: signing in comes before picking a profile",
  "POST /api/auth/logout": "anyone may sign out",
  "POST /api/webauthn/login/options": "public: passkey sign-in",
  "POST /api/webauthn/login": "public: passkey sign-in",
  "POST /api/webauthn/register/options": "registers a passkey for the current profile (PIN or account password proof)",
  "POST /api/webauthn/register": "registers a passkey for the current profile",
  "POST /api/webauthn/auth/options": "unlocks the current profile's vault/privacy with its own passkey",
  "POST /api/webauthn/auth": "unlocks the current profile's vault/privacy with its own passkey",
  "DELETE /api/webauthn/credentials/:id": "a profile removes its own passkeys (owner: any)",
  "POST /api/profiles/:id/select": "picking who is watching (PIN-checked)",
  "POST /api/profiles/deselect": "back to the picker",
  "PATCH /api/profiles/:id": "self may rename/recolour; anyone else's is checked in the handler (owner)",
  "PUT /api/profiles/:id/pin": "self with current PIN, or owner with the account password",
  "PUT /api/appearance": "per-profile appearance",
  "PUT /api/privacy/password": "per-profile privacy password",
  "POST /api/privacy/unlock": "per-profile privacy unlock",
  "PUT /api/vault/pin": "per-profile vault PIN",
  "POST /api/vault/unlock": "per-profile vault",
  "POST /api/vault/lock": "per-profile vault",
  "PUT /api/media-items/:id/hidden": "hides in the current profile's vault",
  "PUT /api/media-items/:id/playback": "per-profile watch progress",
  "PUT /api/media-items/:id/watched": "per-profile watched state",
  "DELETE /api/continue-watching": "per-profile history",
  "POST /api/media-items/:id/bookmarks": "per-profile bookmarks",
  "PATCH /api/bookmarks/:id": "per-profile bookmarks",
  "DELETE /api/bookmarks/:id": "per-profile bookmarks",
  "POST /api/achievements/unlock": "per-profile trophies",
  "PATCH /api/media-items/:id":
    "mixed: isFavorite/rating are per profile; every metadata field is refused for non-owners in the handler (OWNER_FIELDS)",
  "PATCH /api/performers/:id":
    "mixed: isFavorite is per profile; every other field is refused for non-owners in the handler",
};

/**
 * Routes a signed-in session may use before picking a profile. Everything
 * else answers 409 profile_required until one is picked.
 */
export const PROFILE_OPTIONAL_ROUTES: ReadonlySet<string> = new Set([
  "GET /api/auth/status",
  "POST /api/auth/logout",
  "GET /api/profiles",
  "POST /api/profiles/:id/select",
]);

export const routeKey = (method: string, url: string) => `${method} ${url}`;
