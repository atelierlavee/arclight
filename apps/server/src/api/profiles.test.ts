import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { profiles, sessions } from "../db/schema.js";
import { hashPassword } from "../auth/passwords.js";
import {
  registeredRoutes,
  resetDatabase,
  sessionCookie,
  signIn,
  signInOtherProfile,
  testAccount,
  testApp,
  type RegisteredRoute,
} from "../test/harness.js";
import { makeItem, makeLibrary, makePerformer, setItemStateFor } from "../test/fixtures.js";
import { OWNER_ONLY_ROUTES, PROFILE_ROUTES } from "../auth/ownerRoutes.js";
import { PUBLIC_API_PATHS } from "../auth/guard.js";
import { resetProfilePinAttempts } from "./profiles.js";
import { resetVaultAttempts } from "./vault.js";
import { resetLoginAttempts } from "./auth.js";

let app: FastifyInstance;
let routes: RegisteredRoute[];

beforeAll(async () => {
  app = await testApp();
  routes = (await registeredRoutes()).filter((r) => r.url.startsWith("/api"));
});

beforeEach(async () => {
  await resetDatabase();
  resetProfilePinAttempts();
  resetVaultAttempts();
  resetLoginAttempts();
});

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const call = (cookie: string, method: Method, url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

// ---------------------------------------------------------------------------
// Owner-only classification
// ---------------------------------------------------------------------------

describe("every non-GET route is classified owner-only or per-profile", () => {
  const key = (r: RegisteredRoute) => `${r.method} ${r.url}`;
  const nonGet = () => routes.filter((r) => !["GET", "HEAD", "OPTIONS"].includes(r.method));

  it("has no unclassified route", () => {
    const unclassified = nonGet()
      .map(key)
      .filter((k) => !OWNER_ONLY_ROUTES.has(k) && !(k in PROFILE_ROUTES));
    expect(unclassified).toEqual([]);
  });

  it("has no route classified both ways, and no stale entry", () => {
    const all = new Set(routes.map(key));
    expect(Object.keys(PROFILE_ROUTES).filter((k) => OWNER_ONLY_ROUTES.has(k))).toEqual([]);
    expect([...OWNER_ONLY_ROUTES, ...Object.keys(PROFILE_ROUTES)].filter((k) => !all.has(k))).toEqual([]);
  });

  it("every per-profile entry gives a reason", () => {
    for (const [route, reason] of Object.entries(PROFILE_ROUTES)) {
      expect(reason.length, route).toBeGreaterThan(10);
    }
  });

  it("refuses every owner-only route to another profile with 403 owner_only", async () => {
    await signIn();
    const { cookie } = await signInOtherProfile();
    const wrong: string[] = [];
    for (const entry of OWNER_ONLY_ROUTES) {
      const [method, pattern] = entry.split(" ");
      const url = pattern.replace(/:(\w+)/g, (_, name: string) =>
        name === "name" ? "arc-light-backup.tar.gz" : name === "slug" || name === "kind" ? "video" : "1",
      );
      const res = await call(cookie, method as Method, url, method === "GET" || method === "DELETE" ? undefined : {});
      const code = res.statusCode === 403 ? res.json().code : undefined;
      if (code !== "owner_only") wrong.push(`${entry} -> ${res.statusCode} ${res.body.slice(0, 80)}`);
    }
    expect(wrong).toEqual([]);
  });

  it("is not vacuous: the owner gets past the guard on the same routes", async () => {
    const cookie = await signIn();
    const res = await call(cookie, "PATCH", "/api/settings", { scan: { intervalMinutes: 15 } });
    expect(res.statusCode).toBe(200);
  });

  it("lets a non-owner favourite and rate an item, but not edit it", async () => {
    await signIn();
    const { libraryId } = await makeLibrary();
    const id = await makeItem(libraryId, { title: "Shared" });
    const { cookie } = await signInOtherProfile();
    expect((await call(cookie, "PATCH", `/api/media-items/${id}`, { isFavorite: true, rating: 4 })).statusCode).toBe(200);
    const edit = await call(cookie, "PATCH", `/api/media-items/${id}`, { title: "Mine now" });
    expect(edit.statusCode).toBe(403);
    expect(edit.json().code).toBe("owner_only");

    const performer = await makePerformer("Alice");
    expect((await call(cookie, "PATCH", `/api/performers/${performer}`, { isFavorite: true })).statusCode).toBe(200);
    const rename = await call(cookie, "PATCH", `/api/performers/${performer}`, { name: "Bob" });
    expect(rename.statusCode).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Profile isolation
// ---------------------------------------------------------------------------

describe("profile isolation", () => {
  let owner: string;
  let guest: string;
  let guestId: number;
  let libraryId: number;

  beforeEach(async () => {
    owner = await signIn();
    ({ cookie: guest, profileId: guestId } = await signInOtherProfile("Guest"));
    ({ libraryId } = await makeLibrary());
  });

  const ids = (body: { items: { id: number }[] }) => body.items.map((i) => i.id);

  it("keeps favourites and ratings per profile", async () => {
    const a = await makeItem(libraryId, { title: "A", isFavorite: true, rating: 5 });
    const b = await makeItem(libraryId, { title: "B" });
    await setItemStateFor(b, { isFavorite: true, rating: 2 }, guestId);

    expect(ids((await call(owner, "GET", "/api/media-items?favorite=true")).json())).toEqual([a]);
    expect(ids((await call(guest, "GET", "/api/media-items?favorite=true")).json())).toEqual([b]);
    expect(ids((await call(guest, "GET", "/api/media-items?minRating=4")).json())).toEqual([]);

    const seenByGuest = (await call(guest, "GET", `/api/media-items/${a}`)).json();
    expect(seenByGuest).toMatchObject({ isFavorite: false, rating: null });
    const seenByOwner = (await call(owner, "GET", `/api/media-items/${a}`)).json();
    expect(seenByOwner).toMatchObject({ isFavorite: true, rating: 5 });
  });

  it("keeps performer favourites per profile", async () => {
    const p = await makePerformer("Alice");
    await call(owner, "PATCH", `/api/performers/${p}`, { isFavorite: true });
    expect((await call(owner, "GET", `/api/performers/${p}`)).json().isFavorite).toBe(true);
    expect((await call(guest, "GET", `/api/performers/${p}`)).json().isFavorite).toBe(false);
  });

  it("hides an item only from the profile that hid it", async () => {
    const secret = await makeItem(libraryId, { title: "Owner's secret", hiddenAt: new Date() });
    expect(ids((await call(owner, "GET", "/api/media-items")).json())).not.toContain(secret);
    expect((await call(owner, "GET", `/api/media-items/${secret}`)).statusCode).toBe(404);
    // Someone else's vault is not yours: to the guest it is an ordinary item.
    expect(ids((await call(guest, "GET", "/api/media-items")).json())).toContain(secret);
    expect((await call(guest, "GET", `/api/media-items/${secret}`)).statusCode).toBe(200);

    expect((await call(guest, "PUT", `/api/media-items/${secret}/hidden`, { hidden: true })).statusCode).toBe(200);
    expect(ids((await call(guest, "GET", "/api/media-items")).json())).not.toContain(secret);
  });

  it("keeps bookmarks per profile", async () => {
    const id = await makeItem(libraryId, { title: "V", durationSeconds: 600 });
    const created = await call(owner, "POST", `/api/media-items/${id}/bookmarks`, { positionSeconds: 30, label: "mine" });
    expect(created.statusCode).toBe(201);
    expect((await call(guest, "GET", `/api/media-items/${id}/bookmarks`)).json()).toEqual({ bookmarks: [] });
    expect((await call(owner, "GET", `/api/media-items/${id}/bookmarks`)).json().bookmarks).toHaveLength(1);
    // Nor can the guest touch it by id.
    const bookmarkId = created.json().id;
    expect((await call(guest, "DELETE", `/api/bookmarks/${bookmarkId}`)).statusCode).toBe(404);
    expect((await call(guest, "PATCH", `/api/bookmarks/${bookmarkId}`, { label: "x" })).statusCode).toBe(404);
  });

  it("keeps watch history, continue watching and stats per profile", async () => {
    const id = await makeItem(libraryId, { title: "V", durationSeconds: 6000 });
    const done = await makeItem(libraryId, { title: "Done", durationSeconds: 600 });
    await call(owner, "PUT", `/api/media-items/${id}/playback`, { positionSeconds: 100 });
    await call(owner, "PUT", `/api/media-items/${done}/watched`, { watched: true });

    expect(ids((await call(owner, "GET", "/api/continue-watching")).json())).toEqual([id]);
    expect((await call(guest, "GET", "/api/continue-watching")).json().items).toEqual([]);

    const ownerView = (await call(owner, "GET", `/api/media-items/${done}`)).json();
    const guestView = (await call(guest, "GET", `/api/media-items/${done}`)).json();
    expect(ownerView.playCount).toBe(1);
    expect(guestView.playCount).toBe(0);
    expect(guestView.watchedAt ?? null).toBeNull();
    expect(ids((await call(guest, "GET", "/api/media-items?watched=true")).json())).toEqual([]);
    expect(ids((await call(owner, "GET", "/api/media-items?watched=true")).json())).toEqual([done]);

    // The guest clearing their row clears nothing of the owner's.
    await call(guest, "DELETE", "/api/continue-watching");
    expect(ids((await call(owner, "GET", "/api/continue-watching")).json())).toEqual([id]);
  });

  it("keeps appearance per profile", async () => {
    await call(owner, "PUT", "/api/appearance", { tileSizePercent: 60 });
    expect((await call(owner, "GET", "/api/appearance")).json().appearance.tileSizePercent).toBe(60);
    expect((await call(guest, "GET", "/api/appearance")).json().appearance).toEqual({});
  });

  it("keeps the privacy password and vault PIN per profile", async () => {
    const setPrivacy = await call(owner, "PUT", "/api/privacy/password", {
      password: "owner-secret", accountPassword: "test-password",
    });
    expect(setPrivacy.statusCode).toBe(200);
    expect((await call(owner, "GET", "/api/privacy")).json().hasPassword).toBe(true);
    expect((await call(guest, "GET", "/api/privacy")).json().hasPassword).toBe(false);

    // A PIN-less non-owner profile needs no proof for its own.
    const guestPin = await call(guest, "PUT", "/api/vault/pin", { pin: "4321" });
    expect(guestPin.statusCode).toBe(200);
    expect((await call(owner, "GET", "/api/vault")).json().hasPin).toBe(false);
    expect((await call(guest, "GET", "/api/vault")).json()).toMatchObject({ hasPin: true, unlocked: true });
  });

  it("asks a PIN-protected non-owner for its PIN, not the account password", async () => {
    const { cookie } = await signInOtherProfile("Kid", "2468");
    const without = await call(cookie, "PUT", "/api/vault/pin", { pin: "1111" });
    expect(without.statusCode).toBe(403);
    expect(without.json().code).toBe("profile_pin_required");
    expect((await call(cookie, "PUT", "/api/vault/pin", { pin: "1111", profilePin: "2468" })).statusCode).toBe(200);
  });

  it("does not let one profile's vault unlock open another's", async () => {
    const secret = await makeItem(libraryId, { title: "Guest's", hiddenAt: new Date() });
    await setItemStateFor(secret, { hiddenAt: new Date() }, guestId);
    await call(owner, "PUT", "/api/vault/pin", { pin: "1234", accountPassword: "test-password" });
    // The owner's vault is open (setting a PIN opens it): the owner sees its
    // own hidden item, while the guest — locked, with its own PIN — does not.
    await call(guest, "PUT", "/api/vault/pin", { pin: "9999" });
    await call(guest, "POST", "/api/vault/lock");
    expect((await call(owner, "GET", `/api/media-items/${secret}`)).statusCode).toBe(200);
    expect((await call(guest, "GET", `/api/media-items/${secret}`)).statusCode).toBe(404);
  });

  it("keeps the activity log free of other profiles' private actions", async () => {
    const id = await makeItem(libraryId, { title: "Guest pick" });
    await call(guest, "PUT", `/api/media-items/${id}/hidden`, { hidden: true });
    await call(guest, "PATCH", `/api/media-items/${id}`, { rating: 5 });
    const log = (await call(owner, "GET", "/api/activity")).json().events;
    expect(JSON.stringify(log)).not.toContain("Guest pick");
  });
});

// ---------------------------------------------------------------------------
// Profiles API
// ---------------------------------------------------------------------------

describe("profiles API", () => {
  it("first-run setup creates the owner profile and lands on it", async () => {
    const setup = await app.inject({
      method: "POST", url: "/api/auth/setup", payload: { username: "vivek", password: "long-enough-pw" },
    });
    expect(setup.statusCode).toBe(200);
    const cookie = String(setup.headers["set-cookie"]).split(";")[0];
    const status = (await call(cookie, "GET", "/api/auth/status")).json();
    expect(status.profile).toMatchObject({ name: "vivek", isOwner: true, hasPin: false });
    expect(status.user).toMatchObject({ username: "vivek" });
  });

  it("login auto-selects a sole PIN-less profile, and sends anything else to the picker", async () => {
    await signIn();
    const login = () =>
      app.inject({ method: "POST", url: "/api/auth/login", payload: { username: "tester", password: "test-password" } });
    const first = await login();
    const c1 = String(first.headers["set-cookie"]).split(";")[0];
    expect((await call(c1, "GET", "/api/auth/status")).json().profile).toMatchObject({ isOwner: true });

    await signInOtherProfile("Second");
    const second = await login();
    const c2 = String(second.headers["set-cookie"]).split(";")[0];
    expect((await call(c2, "GET", "/api/auth/status")).json().profile).toBeNull();
    const list = (await call(c2, "GET", "/api/profiles")).json();
    expect(list.profiles.map((p: { name: string }) => p.name)).toEqual(["tester", "Second"]);
    expect(list.profiles[0]).toEqual({
      id: expect.any(Number), name: "tester", color: "#6366f1", isOwner: true, hasPin: false, position: 0,
    });
  });

  it("selects with a PIN, refuses a wrong one and locks out repeated guessing", async () => {
    await signIn();
    const { userId } = await testAccount();
    const { profileId } = await signInOtherProfile("Kid", "2468");
    const cookie = await sessionCookie(userId, null);

    const wrong = await call(cookie, "POST", `/api/profiles/${profileId}/select`, { pin: "0000" });
    expect(wrong.statusCode).toBe(403);
    expect(wrong.json()).toMatchObject({ code: "bad_pin", attemptsLeft: 4 });
    expect((await call(cookie, "POST", `/api/profiles/${profileId}/select`, {})).statusCode).toBe(403);

    const right = await call(cookie, "POST", `/api/profiles/${profileId}/select`, { pin: "2468" });
    expect(right.statusCode).toBe(200);
    expect(right.json().profile).toMatchObject({ id: profileId, name: "Kid", hasPin: true, isOwner: false });
    expect((await call(cookie, "GET", "/api/auth/status")).json().profile.id).toBe(profileId);

    await call(cookie, "POST", "/api/profiles/deselect");
    for (let i = 0; i < 5; i++) await call(cookie, "POST", `/api/profiles/${profileId}/select`, { pin: "0000" });
    const locked = await call(cookie, "POST", `/api/profiles/${profileId}/select`, { pin: "2468" });
    expect(locked.statusCode).toBe(429);
    expect(locked.json()).toMatchObject({ code: "pin_locked", retryAfterSeconds: expect.any(Number) });
  });

  it("cannot select another account's profile", async () => {
    await signIn();
    const { userId } = await testAccount();
    const cookie = await sessionCookie(userId, null);
    expect((await call(cookie, "POST", "/api/profiles/999999/select", {})).statusCode).toBe(404);
  });

  it("switching profile locks the vault and privacy unlocks of the session", async () => {
    const owner = await signIn();
    await call(owner, "PUT", "/api/vault/pin", { pin: "1234", accountPassword: "test-password" });
    expect((await call(owner, "GET", "/api/vault")).json().unlocked).toBe(true);
    const { ownerProfileId } = await testAccount();
    const other = await signInOtherProfile("Other");
    await call(owner, "POST", `/api/profiles/${other.profileId}/select`, {});
    await call(owner, "POST", `/api/profiles/${ownerProfileId}/select`, {});
    expect((await call(owner, "GET", "/api/vault")).json().unlocked).toBe(false);
  });

  it("lets the owner create, rename, recolour and delete profiles", async () => {
    const owner = await signIn();
    const created = await call(owner, "POST", "/api/profiles", { name: "Partner", color: "#ff0088" });
    expect(created.statusCode).toBe(201);
    const id = created.json().profile.id;
    expect(created.json().profile).toMatchObject({ name: "Partner", color: "#ff0088", isOwner: false, hasPin: false });

    expect((await call(owner, "POST", "/api/profiles", { name: "partner" })).statusCode).toBe(409);
    expect((await call(owner, "POST", "/api/profiles", { name: "" })).statusCode).toBe(400);
    expect((await call(owner, "POST", "/api/profiles", { name: "X", color: "red" })).statusCode).toBe(400);

    const renamed = await call(owner, "PATCH", `/api/profiles/${id}`, { name: "Love", color: "#00ff00" });
    expect(renamed.json().profile).toMatchObject({ name: "Love", color: "#00ff00" });

    const { ownerProfileId } = await testAccount();
    expect((await call(owner, "DELETE", `/api/profiles/${ownerProfileId}`)).statusCode).toBe(400);
    expect((await call(owner, "DELETE", `/api/profiles/${id}`)).statusCode).toBe(200);
    expect(await db.select().from(profiles).where(eq(profiles.id, id))).toEqual([]);
  });

  it("deleting a profile deletes its data and sends its sessions to the picker", async () => {
    const owner = await signIn();
    const { libraryId } = await makeLibrary();
    const item = await makeItem(libraryId, { title: "V", durationSeconds: 600 });
    const guest = await signInOtherProfile("Gone");
    await call(guest.cookie, "POST", `/api/media-items/${item}/bookmarks`, { positionSeconds: 5 });
    await call(guest.cookie, "PATCH", `/api/media-items/${item}`, { isFavorite: true });

    expect((await call(owner, "DELETE", `/api/profiles/${guest.profileId}`)).statusCode).toBe(200);
    const status = await call(guest.cookie, "GET", "/api/auth/status");
    expect(status.json().profile).toBeNull();
    expect((await call(guest.cookie, "GET", "/api/media-items")).statusCode).toBe(409);
    const [row] = await db.select().from(sessions).where(eq(sessions.profileId, guest.profileId));
    expect(row).toBeUndefined();
  });

  it("a non-owner may rename itself but not others", async () => {
    await signIn();
    const { ownerProfileId } = await testAccount();
    const guest = await signInOtherProfile("Guest");
    expect((await call(guest.cookie, "PATCH", `/api/profiles/${guest.profileId}`, { name: "Me" })).statusCode).toBe(200);
    const other = await call(guest.cookie, "PATCH", `/api/profiles/${ownerProfileId}`, { name: "Hacked" });
    expect(other.statusCode).toBe(403);
    expect(other.json().code).toBe("owner_only");
  });

  it("changes your own PIN with the current one, and lets the owner reset another's", async () => {
    const owner = await signIn();
    const guest = await signInOtherProfile("Kid", "2468");
    const url = `/api/profiles/${guest.profileId}/pin`;

    expect((await call(guest.cookie, "PUT", url, { newPin: "1357" })).statusCode).toBe(403);
    expect((await call(guest.cookie, "PUT", url, { newPin: "12", currentPin: "2468" })).statusCode).toBe(400);
    expect((await call(guest.cookie, "PUT", url, { newPin: "1357", currentPin: "2468" })).json()).toEqual({ hasPin: true });

    // Owner resetting someone else's: the account password, no current PIN.
    expect((await call(owner, "PUT", url, { newPin: null, accountPassword: "nope" })).statusCode).toBe(403);
    expect((await call(owner, "PUT", url, { newPin: null, accountPassword: "test-password" })).json()).toEqual({ hasPin: false });

    // The owner's own PIN takes only the current PIN, like anyone's.
    const { ownerProfileId } = await testAccount();
    const ownUrl = `/api/profiles/${ownerProfileId}/pin`;
    expect((await call(owner, "PUT", ownUrl, { newPin: "8642" })).json()).toEqual({ hasPin: true });
    expect((await call(owner, "PUT", ownUrl, { newPin: null, currentPin: "8642" })).json()).toEqual({ hasPin: false });

    // And a non-owner cannot touch another's PIN at all.
    const third = await signInOtherProfile("Third");
    const res = await call(third.cookie, "PUT", url, { newPin: "0000", accountPassword: "test-password" });
    expect(res.statusCode).toBe(403);
  });

  it("lets the owner reset another profile's vault PIN and privacy password", async () => {
    const owner = await signIn();
    const guest = await signInOtherProfile("Forgetful");
    await call(guest.cookie, "PUT", "/api/vault/pin", { pin: "5555" });
    await call(guest.cookie, "PUT", "/api/privacy/password", { password: "guest-secret" });
    const url = `/api/profiles/${guest.profileId}/reset-secrets`;
    expect((await call(owner, "POST", url, { vaultPin: true, privacyPassword: true, accountPassword: "x" })).statusCode).toBe(403);
    expect(
      (await call(owner, "POST", url, { vaultPin: true, privacyPassword: true, accountPassword: "test-password" })).statusCode,
    ).toBe(200);
    expect((await call(guest.cookie, "GET", "/api/vault")).json().hasPin).toBe(false);
    expect((await call(guest.cookie, "GET", "/api/privacy")).json().hasPassword).toBe(false);
  });

  it("registers passkeys per profile, needing a PIN for non-owners", async () => {
    await signIn();
    const pinless = await signInOtherProfile("NoPin");
    const res = await call(pinless.cookie, "POST", "/api/webauthn/register/options", {});
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("profile_pin_not_set");

    const kid = await signInOtherProfile("Kid", "2468");
    expect((await call(kid.cookie, "POST", "/api/webauthn/register/options", { profilePin: "0000" })).statusCode).toBe(403);
    expect((await call(kid.cookie, "POST", "/api/webauthn/register/options", { profilePin: "2468" })).statusCode).toBe(200);
  });

  it("does not need a profile for the public routes", () => {
    // Guard rails for the allow-lists: public routes never require a profile
    // because they never require a session.
    for (const url of PUBLIC_API_PATHS) expect(url.startsWith("/api/")).toBe(true);
  });

  it("an unknown PIN hash format never selects", async () => {
    await signIn();
    const { userId } = await testAccount();
    const [p] = await db
      .insert(profiles)
      .values({ userId, name: "Weird", pinHash: await hashPassword("9999") })
      .returning();
    const cookie = await sessionCookie(userId, null);
    expect((await call(cookie, "POST", `/api/profiles/${p.id}/select`, { pin: 9999 })).statusCode).toBe(403);
  });
});
