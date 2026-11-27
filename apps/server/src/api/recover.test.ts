// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { readFile } from "node:fs/promises";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { resetDatabase, signIn, testAccount, testApp } from "../test/harness.js";
import { resetLoginAttempts } from "./auth.js";
import { RESET_FILE, resetResetCodeState } from "../auth/resetCode.js";
import { totpAt, totpStep } from "../auth/totp.js";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  resetLoginAttempts();
  resetResetCodeState();
});
afterEach(() => vi.restoreAllMocks());

const post = (url: string, payload: object = {}, cookie?: string) =>
  app.inject({ method: "POST", url, payload, headers: cookie ? { cookie } : {} });

const login = (password: string) => post("/api/auth/login", { username: "tester", password });

/** Asks for a server code and returns it, read back off the log line. */
async function serverCode(): Promise<string> {
  const lines: string[] = [];
  vi.spyOn(console, "warn").mockImplementation((line: string) => void lines.push(line));
  expect((await post("/api/auth/recover/code")).statusCode).toBe(200);
  const match = lines.join("\n").match(/PASSWORD RESET CODE: ([A-Z0-9]{4}-[A-Z0-9]{4})/);
  expect(match).not.toBeNull();
  return match![1];
}

/** Sets up the authenticator through the real endpoints; returns its secret. */
async function enableAuthenticator(cookie: string): Promise<string> {
  const setup = await post("/api/auth/totp/setup", { accountPassword: "test-password" }, cookie);
  expect(setup.statusCode).toBe(200);
  const { secret } = setup.json();
  // A step behind now: still accepted, and leaves the current step free for
  // the reset that follows.
  const code = totpAt(secret, totpStep(Date.now()) - 1);
  expect((await post("/api/auth/totp/enable", { code }, cookie)).statusCode).toBe(200);
  return secret;
}

describe("reset code from the server", () => {
  it("writes the code to the log and to a file, and resets the password with it", async () => {
    const cookie = await signIn();
    const code = await serverCode();
    expect(await readFile(RESET_FILE, "utf8")).toContain(code);

    const res = await post("/api/auth/recover", { method: "server", code, newPassword: "brand-new-pw" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();

    expect((await login("brand-new-pw")).statusCode).toBe(200);
    expect((await login("test-password")).statusCode).toBe(401);
    // Every earlier session is gone, including the one from before.
    const old = await app.inject({ method: "GET", url: "/api/auth/status", headers: { cookie } });
    expect(old.json().user).toBeNull();
    // And the file with the code in it.
    await expect(readFile(RESET_FILE, "utf8")).rejects.toThrow();
  });

  it("works once", async () => {
    await signIn();
    const code = await serverCode();
    await post("/api/auth/recover", { method: "server", code, newPassword: "brand-new-pw" });
    const again = await post("/api/auth/recover", { method: "server", code, newPassword: "other-new-pw" });
    expect(again.statusCode).toBe(401);
  });

  it("accepts the code typed in lower case and without the dash", async () => {
    await signIn();
    const code = await serverCode();
    const typed = code.replace("-", "").toLowerCase();
    expect((await post("/api/auth/recover", { method: "server", code: typed, newPassword: "brand-new-pw" })).statusCode).toBe(200);
  });

  it("refuses a wrong code, and changes nothing", async () => {
    await signIn();
    await serverCode();
    const res = await post("/api/auth/recover", { method: "server", code: "AAAA-AAAA", newPassword: "brand-new-pw" });
    expect(res.statusCode).toBe(401);
    expect((await login("test-password")).statusCode).toBe(200);
  });

  it("refuses a short new password without using the code up", async () => {
    await signIn();
    const code = await serverCode();
    expect((await post("/api/auth/recover", { method: "server", code, newPassword: "short" })).statusCode).toBe(400);
    expect((await post("/api/auth/recover", { method: "server", code, newPassword: "brand-new-pw" })).statusCode).toBe(200);
  });

  it("won't issue codes back to back", async () => {
    await signIn();
    await serverCode();
    expect((await post("/api/auth/recover/code")).statusCode).toBe(429);
  });

  it("never puts the code in the response", async () => {
    await signIn();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const res = await post("/api/auth/recover/code");
    expect(res.body).not.toMatch(/[A-Z0-9]{4}-[A-Z0-9]{4}/);
  });

  it("shares the sign-in attempt limit", async () => {
    await signIn();
    for (let i = 0; i < 10; i++) {
      await post("/api/auth/recover", { method: "server", code: "AAAA-AAAA", newPassword: "brand-new-pw" });
    }
    const res = await post("/api/auth/recover", { method: "server", code: "AAAA-AAAA", newPassword: "brand-new-pw" });
    expect(res.statusCode).toBe(429);
  });
});

describe("authenticator app", () => {
  it("is off until set up, and the sign-in screen is told so", async () => {
    const cookie = await signIn();
    expect((await app.inject({ method: "GET", url: "/api/auth/totp", headers: { cookie } })).json().enabled).toBe(false);
    expect((await app.inject({ method: "GET", url: "/api/auth/status" })).json().recovery).toEqual({ authenticator: false });
  });

  it("needs your password to set up", async () => {
    const cookie = await signIn();
    expect((await post("/api/auth/totp/setup", { accountPassword: "wrong" }, cookie)).statusCode).toBe(403);
  });

  it("only switches on with a matching code", async () => {
    const cookie = await signIn();
    const setup = await post("/api/auth/totp/setup", { accountPassword: "test-password" }, cookie);
    expect(setup.json().uri).toMatch(/^otpauth:\/\/totp\//);
    expect((await post("/api/auth/totp/enable", { code: "000000" }, cookie)).statusCode).toBe(400);
    const { userId } = await testAccount();
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(user.totpSecret).toBeNull();
  });

  it("resets the password with a code from the app", async () => {
    const cookie = await signIn();
    const secret = await enableAuthenticator(cookie);
    expect((await app.inject({ method: "GET", url: "/api/auth/status" })).json().recovery).toEqual({ authenticator: true });

    const code = totpAt(secret, totpStep(Date.now()));
    const res = await post("/api/auth/recover", { method: "authenticator", code, newPassword: "brand-new-pw" });
    expect(res.statusCode).toBe(200);
    expect((await login("brand-new-pw")).statusCode).toBe(200);
  });

  it("won't take the same code twice", async () => {
    const cookie = await signIn();
    const secret = await enableAuthenticator(cookie);
    const code = totpAt(secret, totpStep(Date.now()));
    await post("/api/auth/recover", { method: "authenticator", code, newPassword: "brand-new-pw" });
    const replay = await post("/api/auth/recover", { method: "authenticator", code, newPassword: "other-new-pw" });
    expect(replay.statusCode).toBe(401);
  });

  it("refuses a wrong code", async () => {
    const cookie = await signIn();
    await enableAuthenticator(cookie);
    const res = await post("/api/auth/recover", { method: "authenticator", code: "123456", newPassword: "brand-new-pw" });
    expect(res.statusCode).toBe(401);
  });

  it("refuses authenticator codes when none is set up", async () => {
    await signIn();
    const res = await post("/api/auth/recover", { method: "authenticator", code: "123456", newPassword: "brand-new-pw" });
    expect(res.statusCode).toBe(401);
  });

  it("switches off with your password, and its codes stop working", async () => {
    const cookie = await signIn();
    const secret = await enableAuthenticator(cookie);
    expect((await post("/api/auth/totp/disable", { accountPassword: "wrong" }, cookie)).statusCode).toBe(403);
    expect((await post("/api/auth/totp/disable", { accountPassword: "test-password" }, cookie)).statusCode).toBe(200);
    const code = totpAt(secret, totpStep(Date.now()));
    expect((await post("/api/auth/recover", { method: "authenticator", code, newPassword: "brand-new-pw" })).statusCode).toBe(401);
  });

  it("signs out every session on reset", async () => {
    const cookie = await signIn();
    const secret = await enableAuthenticator(cookie);
    await post("/api/auth/recover", {
      method: "authenticator",
      code: totpAt(secret, totpStep(Date.now())),
      newPassword: "brand-new-pw",
    });
    const { userId } = await testAccount();
    // Only the fresh session from the reset is left.
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(1);
  });
});
