// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { makeItem, makeLibrary, makePhoto } from "../test/fixtures.js";
import { signCastToken, verifyCastToken } from "../auth/castTokens.js";
import { setNetworkSettings } from "./settings.js";
import { forgetLanExposure, lanPort } from "../net/lan.js";

let app: FastifyInstance;
let cookie: string;
let libraryId: number;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  forgetLanExposure();
  cookie = await signIn();
  ({ libraryId } = await makeLibrary());
});
afterEach(() => {
  vi.unstubAllEnvs();
  forgetLanExposure();
});

describe("cast tokens", () => {
  it("verifies for the item it was made for, and no other", () => {
    const token = signCastToken(7);
    expect(verifyCastToken(7, token)).toBe(true);
    expect(verifyCastToken(8, token)).toBe(false);
  });

  it("expires", () => {
    const token = signCastToken(7, Date.now() - 7 * 60 * 60 * 1000);
    expect(verifyCastToken(7, token)).toBe(false);
  });

  it("rejects a tampered or malformed token", () => {
    const [expires, sig] = signCastToken(7).split(".");
    expect(verifyCastToken(7, `${Number(expires) + 3600}.${sig}`)).toBe(false);
    expect(verifyCastToken(7, "nonsense")).toBe(false);
    expect(verifyCastToken(7, "")).toBe(false);
  });
});

describe("GET /api/media-items/:id/cast", () => {
  it("uses the LAN address when asked from this machine", async () => {
    vi.stubEnv("LAN_HOST", "192.168.1.20");
    vi.stubEnv("LAN_PORT", "5173");
    const id = await makeItem(libraryId);
    const res = await app.inject({ url: `/api/media-items/${id}/cast`, headers: { cookie, host: "localhost:5173" } });
    expect(res.json()).toMatchObject({ lanReachable: true });
    expect(res.json().url).toMatch(new RegExp(`^http://192\\.168\\.1\\.20:5173/api/stream/${id}\\?cast=`));
  });

  it("keeps the phone's own host when asked from a phone", async () => {
    const id = await makeItem(libraryId);
    const res = await app.inject({ url: `/api/media-items/${id}/cast`, headers: { cookie, host: "192.168.1.20:5173" } });
    expect(res.json().url).toMatch(/^http:\/\/192\.168\.1\.20:5173\/api\/stream\//);
  });

  it("refuses a photo", async () => {
    const id = await makePhoto(libraryId);
    const res = await app.inject({ url: `/api/media-items/${id}/cast`, headers: { cookie } });
    expect(res.statusCode).toBe(404);
  });
});

describe("streaming with a cast token", () => {
  // The fixture item has no file, so a request that gets past both guards
  // ends in the route's own 404. 401 or 403 means a guard stopped it.
  it("gets past the session guard without a cookie", async () => {
    const id = await makeItem(libraryId);
    const res = await app.inject({ url: `/api/stream/${id}?cast=${signCastToken(id)}` });
    expect(res.statusCode).toBe(404);
  });

  it("does not unlock a different video, or any other route", async () => {
    const id = await makeItem(libraryId);
    const other = await makeItem(libraryId);
    const token = signCastToken(id);
    expect((await app.inject({ url: `/api/stream/${other}?cast=${token}` })).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/media-items/${id}?cast=${token}` })).statusCode).toBe(401);
    expect((await app.inject({ url: `/api/stream/${id}` })).statusCode).toBe(401);
  });

  it("gets past the local-network switch, which still blocks everything else", async () => {
    await setNetworkSettings(false);
    forgetLanExposure(false);
    const id = await makeItem(libraryId);
    const host = "192.168.1.50:5173";
    expect(
      (await app.inject({ url: `/api/stream/${id}?cast=${signCastToken(id)}`, headers: { host } })).statusCode
    ).toBe(404);
    expect((await app.inject({ url: `/api/stream/${id}`, headers: { host, cookie } })).statusCode).toBe(403);
  });
});

describe("lanPort", () => {
  it("is Vite's in development and the server's in production", () => {
    vi.stubEnv("LAN_PORT", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(lanPort()).toBe(5173);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PORT", "3000");
    expect(lanPort()).toBe(3000);
    vi.stubEnv("LAN_PORT", "8080");
    expect(lanPort()).toBe(8080);
  });
});
