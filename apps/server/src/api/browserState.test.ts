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

function put(payload: unknown) {
  return app.inject({
    method: "PUT",
    url: "/api/browser-state",
    headers: { cookie },
    payload: payload as object,
  });
}

async function load() {
  const res = await app.inject({ method: "GET", url: "/api/browser-state", headers: { cookie } });
  return (res.json() as { entries: Record<string, string> }).entries;
}

describe("browser state", () => {
  it("starts empty", async () => {
    expect(await load()).toEqual({});
  });

  it("keeps each key as the string it was sent", async () => {
    await put({ key: "pinned-items", value: '[{"id":4}]' });
    await put({ key: "performers-sort", value: "name" });
    expect(await load()).toEqual({ "pinned-items": '[{"id":4}]', "performers-sort": "name" });
  });

  it("replaces a key, and forgets it on null", async () => {
    await put({ key: "feed-last-seen", value: "1" });
    await put({ key: "feed-last-seen", value: "2" });
    expect(await load()).toEqual({ "feed-last-seen": "2" });
    await put({ key: "feed-last-seen", value: null });
    expect(await load()).toEqual({});
  });

  it("keeps every key when many saves land at once", async () => {
    await Promise.all(Array.from({ length: 10 }, (_, n) => put({ key: `recent-${n}`, value: String(n) })));
    expect(Object.keys(await load())).toHaveLength(10);
  });

  it("refuses a key that is not a storage key", async () => {
    expect((await put({ key: "../etc", value: "x" })).statusCode).toBe(400);
    expect((await put({ key: "", value: "x" })).statusCode).toBe(400);
    expect((await put({ value: "x" })).statusCode).toBe(400);
  });

  it("refuses a value that is not a string, or is far too big", async () => {
    expect((await put({ key: "pinned-items", value: { a: 1 } })).statusCode).toBe(400);
    expect((await put({ key: "pinned-items", value: "x".repeat(300 * 1024) })).statusCode).toBe(400);
    expect(await load()).toEqual({});
  });
});
