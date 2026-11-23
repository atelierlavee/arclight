// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";

let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
});

const get = (url: string) => app.inject({ method: "GET", url, headers: { cookie } });
const send = (method: "POST" | "PUT", url: string, payload: unknown) =>
  app.inject({ method, url, headers: { cookie }, payload: payload as object });

const set = (password: string) =>
  send("PUT", "/api/privacy/password", { password, accountPassword: "test-password" });

describe("privacy password", () => {
  it("reports whether one is set, without ever returning the hash", async () => {
    expect((await get("/api/privacy")).json()).toEqual({ hasPassword: false });

    await set("hunter2-long-enough");

    const body = (await get("/api/privacy")).json();
    expect(body).toEqual({ hasPassword: true });
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("throttles after repeated wrong guesses", async () => {
    await set("hunter2-long-enough");

    for (let i = 0; i < 5; i++) {
      expect((await send("POST", "/api/privacy/unlock", { password: "no" })).statusCode).toBe(403);
    }
    // The sixth is refused without even checking the password — and the right
    // one is refused too, which is what makes the wait meaningful.
    const blocked = await send("POST", "/api/privacy/unlock", {
      password: "hunter2-long-enough",
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().retryAfterSeconds).toBeGreaterThan(0);
  });

  it("unlocks with the right password and refuses the wrong one", async () => {
    await set("hunter2-long-enough");

    expect((await send("POST", "/api/privacy/unlock", { password: "nope" })).statusCode).toBe(403);
    const ok = await send("POST", "/api/privacy/unlock", { password: "hunter2-long-enough" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().ok).toBe(true);
  });

  it("unlocks freely when none is set, rather than trapping you in discreet mode", async () => {
    const res = await send("POST", "/api/privacy/unlock", { password: "" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it("requires the account password to set one", async () => {
    const res = await send("PUT", "/api/privacy/password", {
      password: "hunter2-long-enough",
      accountPassword: "wrong",
    });
    expect(res.statusCode).toBe(403);
    expect((await get("/api/privacy")).json().hasPassword).toBe(false);
  });

  it("rejects a short password rather than storing something guessable", async () => {
    expect((await set("short")).statusCode).toBe(400);
    expect((await get("/api/privacy")).json().hasPassword).toBe(false);
  });

  it("clears with an empty password, which is the way back from a forgotten one", async () => {
    await set("hunter2-long-enough");
    expect((await set("")).json().hasPassword).toBe(false);
    // And the old password no longer unlocks anything, because nothing is set.
    expect((await get("/api/privacy")).json().hasPassword).toBe(false);
  });

  it("refuses everything without a session", async () => {
    const anon = await app.inject({ method: "GET", url: "/api/privacy" });
    expect(anon.statusCode).toBe(401);
  });
});
