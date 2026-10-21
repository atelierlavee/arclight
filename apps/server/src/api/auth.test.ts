import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, testApp } from "../test/harness.js";
import { resetLoginAttempts } from "./auth.js";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  resetLoginAttempts();
});
afterEach(() => vi.restoreAllMocks());

// `payload` is typed as an object rather than unknown: with unknown,
// TypeScript cannot pick the right `inject` overload and every call to the
// result loses its type.
const post = (url: string, payload: object, cookie?: string) =>
  app.inject({ method: "POST", url, payload, headers: cookie ? { cookie } : {} });

describe("first-run setup", () => {
  it("reports that setup is needed when there is no account", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/auth/status" })).json();
    expect(body.needsSetup).toBe(true);
    expect(body.user).toBeNull();
  });

  it("creates the first account and signs you in", async () => {
    const res = await post("/api/auth/setup", { username: "me", password: "long-enough-pw" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("never echoes the session id, which the httpOnly cookie keeps from scripts", async () => {
    const res = await post("/api/auth/setup", { username: "me", password: "long-enough-pw" });
    const cookie = String(res.headers["set-cookie"]).split(";")[0];
    const status = await app.inject({ method: "GET", url: "/api/auth/status", headers: { cookie } });
    expect(status.json().user.username).toBe("me");
    expect(status.body).not.toContain(cookie.split("=")[1]);
  });

  it("refuses a second account", async () => {
    await post("/api/auth/setup", { username: "me", password: "long-enough-pw" });
    const res = await post("/api/auth/setup", { username: "other", password: "long-enough-pw" });
    expect(res.statusCode).toBe(409);
  });

  it("rejects a password shorter than the minimum", async () => {
    expect((await post("/api/auth/setup", { username: "me", password: "short" })).statusCode).toBe(
      400
    );
  });
});

describe("login", () => {
  beforeEach(async () => {
    await post("/api/auth/setup", { username: "me", password: "long-enough-pw" });
  });

  it("accepts the right password", async () => {
    const res = await post("/api/auth/login", { username: "me", password: "long-enough-pw" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects a wrong password without saying which half was wrong", async () => {
    const wrongPassword = await post("/api/auth/login", { username: "me", password: "nope-nope" });
    const wrongUser = await post("/api/auth/login", { username: "nobody", password: "nope-nope" });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongUser.statusCode).toBe(401);
    // Identical responses: a different message would let someone probe for
    // valid usernames.
    expect(wrongPassword.json()).toEqual(wrongUser.json());
  });

  it("sets an httpOnly cookie so scripts cannot read the session", async () => {
    const res = await post("/api/auth/login", { username: "me", password: "long-enough-pw" });
    const cookies = String(res.headers["set-cookie"]);
    expect(cookies.toLowerCase()).toContain("httponly");
    expect(cookies.toLowerCase()).toContain("samesite=lax");
  });
});

describe("session lifetime", () => {
  it("stops working after logout", async () => {
    await post("/api/auth/setup", { username: "me", password: "long-enough-pw" });
    const login = await post("/api/auth/login", { username: "me", password: "long-enough-pw" });
    const cookie = String(login.headers["set-cookie"]).split(";")[0];

    expect((await app.inject({ url: "/api/media-items", headers: { cookie } })).statusCode).toBe(
      200
    );
    await post("/api/auth/logout", {}, cookie);
    expect((await app.inject({ url: "/api/media-items", headers: { cookie } })).statusCode).toBe(
      401
    );
  });
});

describe("first-run setup race", () => {
  it("creates exactly one account when two setups arrive together", async () => {
    const results = await Promise.all([
      post("/api/auth/setup", { username: "first", password: "long-enough-pw" }),
      post("/api/auth/setup", { username: "second", password: "long-enough-pw" }),
      post("/api/auth/setup", { username: "third", password: "long-enough-pw" }),
    ]);
    const codes = results.map((res) => res.statusCode).sort();
    expect(codes).toEqual([200, 409, 409]);
    expect(await db.select().from(users)).toHaveLength(1);
  }, 60_000);
});

describe("login throttle", () => {
  beforeEach(async () => {
    await post("/api/auth/setup", { username: "me", password: "long-enough-pw" });
  });

  const wrong = () => post("/api/auth/login", { username: "me", password: "nope-nope" });
  const right = () => post("/api/auth/login", { username: "me", password: "long-enough-pw" });

  it("refuses even the right password after ten failures", async () => {
    for (let i = 0; i < 10; i++) expect((await wrong()).statusCode).toBe(401);
    const blocked = await right();
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  }, 60_000);

  it("lets you back in once the failures age out of the window", async () => {
    const start = Date.now();
    for (let i = 0; i < 10; i++) await wrong();
    expect((await right()).statusCode).toBe(429);

    vi.spyOn(Date, "now").mockReturnValue(start + 15 * 60 * 1000 + 1000);
    expect((await right()).statusCode).toBe(200);
  }, 60_000);

  it("slides rather than resetting on a fixed boundary", async () => {
    const start = Date.now();
    const now = vi.spyOn(Date, "now");
    // Five early, five late: at no point does a fresh window wipe the slate.
    now.mockReturnValue(start);
    for (let i = 0; i < 5; i++) await wrong();
    now.mockReturnValue(start + 10 * 60 * 1000);
    for (let i = 0; i < 5; i++) await wrong();
    expect((await right()).statusCode).toBe(429);
    // Once the early five have aged out, there is budget again.
    now.mockReturnValue(start + 15 * 60 * 1000 + 1000);
    expect((await right()).statusCode).toBe(200);
  }, 60_000);

  it("a successful login clears the caller's own count", async () => {
    for (let i = 0; i < 9; i++) await wrong();
    expect((await right()).statusCode).toBe(200);
    for (let i = 0; i < 9; i++) expect((await wrong()).statusCode).toBe(401);
    expect((await right()).statusCode).toBe(200);
  }, 60_000);

  it("has a global backstop across addresses", async () => {
    for (let i = 0; i < 50; i++) {
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { username: "me", password: "nope-nope" },
        remoteAddress: `10.0.0.${i}`,
      });
    }
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "me", password: "long-enough-pw" },
      remoteAddress: "10.0.1.1",
    });
    expect(res.statusCode).toBe(429);
  }, 60_000);
});
