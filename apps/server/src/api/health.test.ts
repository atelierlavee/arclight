// Copyright 2026 atelierlavee
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

describe("the auth guard", () => {
  it("lets the health check through without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: true });
  });

  it("refuses an API request with no session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/media-items" });
    expect(res.statusCode).toBe(401);
  });

  it("refuses a made-up session cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/media-items",
      headers: { cookie: "media_session=not-a-real-session" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("allows the request once signed in", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/media-items",
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
  });
});
