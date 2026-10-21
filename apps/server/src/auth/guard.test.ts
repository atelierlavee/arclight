import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { claimRestore, releaseRestore } from "../backup/restoreState.js";
import { isApiUrl } from "./paths.js";
import { signCastToken, isAuthorisedCastStream } from "./castTokens.js";

let app: FastifyInstance;

let port: number;

beforeAll(async () => {
  app = await testApp();
  // Over a real socket, not app.inject(): inject runs the URL through WHATWG
  // parsing, which resolves `%2e%2e` and `//` before the server ever sees
  // them — exactly the spellings an attacker's raw request keeps intact.
  await app.listen({ port: 0, host: "127.0.0.1" });
  port = (app.server.address() as AddressInfo).port;
});
afterAll(async () => {
  await app.close();
});

/** A GET with the path sent byte for byte as written. */
function rawGet(path: string, cookie?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, method: "GET", headers: cookie ? { cookie } : {} },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.end();
  });
}
beforeEach(async () => {
  await resetDatabase();
});

/**
 * Spellings of an /api path that the router still sends to an /api handler,
 * or that something downstream could resolve to one. The guard once tested
 * the raw string with startsWith("/api/"), and the first of these walked
 * straight past it into the media list with no session at all.
 */
const SNEAKY_PATHS = [
  "/%61pi/media-items",
  "/%61%70%69/media-items",
  "/api%2Fmedia-items",
  "/api/%2e%2e/",
  "/api/%2e%2e/media-items",
  "//api/media-items",
  "/api//media-items",
  "/API/media-items",
  "/x/../api/media-items",
];

describe("auth guard path handling", () => {
  it.each(SNEAKY_PATHS)("refuses %s without a session", async (url) => {
    expect(await rawGet(url)).toBe(401);
  });

  it("still routes an encoded path for a signed-in session — so the 401 above is the guard, not a 404", async () => {
    const cookie = await signIn();
    expect(await rawGet("/%61pi/media-items", cookie)).toBe(200);
  });

  it("keeps the public endpoints public, by route rather than by spelling", async () => {
    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/auth/status?x=1" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/%61pi/auth/status" })).statusCode).toBe(200);
  });

  it("does not let a query string smuggle a public path", async () => {
    const res = await app.inject({ method: "GET", url: "/api/media-items?/api/health" });
    expect(res.statusCode).toBe(401);
  });

  it("classifies paths the way the router could read them", () => {
    for (const url of SNEAKY_PATHS) expect(isApiUrl(url)).toBe(true);
    // An escape that does not decode is treated as /api: fail closed.
    expect(isApiUrl("/%E0%A4%A")).toBe(true);
    expect(isApiUrl("/")).toBe(false);
    expect(isApiUrl("/assets/index.js")).toBe(false);
    expect(isApiUrl("/apix")).toBe(false);
  });
});

describe("cast tokens", () => {
  it("accept the decoded spelling of the stream they were signed for, and only that", () => {
    const token = signCastToken(5);
    expect(isAuthorisedCastStream("GET", `/api/stream/5?cast=${token}`)).toBe(true);
    expect(isAuthorisedCastStream("GET", `/%61pi/stream/%35?cast=${token}`)).toBe(true);
    expect(isAuthorisedCastStream("GET", `/api/stream/6?cast=${token}`)).toBe(false);
    expect(isAuthorisedCastStream("POST", `/api/stream/5?cast=${token}`)).toBe(false);
    expect(isAuthorisedCastStream("GET", `//host/api/stream/5?cast=${token}`)).toBe(false);
  });
});

describe("restore gate", () => {
  afterEach(() => releaseRestore());

  it("holds back encoded /api paths as well as plain ones, but not health", async () => {
    expect(claimRestore()).toBe(true);
    for (const url of ["/api/media-items", "/%61pi/media-items", "//api/media-items", "/api/%2e%2e/x"]) {
      expect(await rawGet(url)).toBe(503);
    }
    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
  });
});

describe("cross-origin writes", () => {
  const logout = (headers: Record<string, string>) =>
    app.inject({ method: "POST", url: "/api/auth/logout", headers });

  it("refuses a state-changing request from another origin", async () => {
    const res = await logout({ host: "localhost:3000", origin: "http://evil.example" });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("bad_origin");
  });

  it("refuses another port on the same host — same-site, so SameSite=Lax would not", async () => {
    expect((await logout({ host: "localhost:3000", origin: "http://localhost:8080" })).statusCode).toBe(403);
  });

  it("refuses the opaque null origin", async () => {
    expect((await logout({ host: "localhost:3000", origin: "null" })).statusCode).toBe(403);
  });

  it("refuses an encoded path too", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/%61pi/auth/logout",
      headers: { host: "localhost:3000", origin: "http://evil.example" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("allows the page's own origin, the configured app origins, and no Origin at all", async () => {
    expect((await logout({ host: "192.168.1.5:3000", origin: "http://192.168.1.5:3000" })).statusCode).toBe(200);
    expect((await logout({ host: "localhost:3000", origin: "http://localhost:5173" })).statusCode).toBe(200);
    expect((await logout({ host: "localhost:3000" })).statusCode).toBe(200);
  });

  it("leaves reads alone", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: { host: "localhost:3000", origin: "http://evil.example" },
    });
    expect(res.statusCode).toBe(200);
  });
});
