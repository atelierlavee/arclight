import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, signInOtherProfile, testApp } from "../test/harness.js";
import { makeItem, makeLibrary, makePerformer } from "../test/fixtures.js";

let app: FastifyInstance;
let cookie: string;
let libraryId: number;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
  ({ libraryId } = await makeLibrary());
});

const call = (method: "GET" | "PUT", url: string, payload?: unknown, as = cookie) =>
  app.inject({ method, url, payload: payload as object, headers: { cookie: as } });
const titles = (body: { items: { title: string }[] }) => body.items.map((i) => i.title);

describe("private notes on items", () => {
  it("saves, trims, clears, and shows on the detail", async () => {
    const id = await makeItem(libraryId, { title: "Scene" });
    const res = await call("PUT", `/api/media-items/${id}/note`, { note: "  great lighting  " });
    expect(res.statusCode).toBe(200);
    expect(res.json().note).toBe("great lighting");
    expect((await call("GET", `/api/media-items/${id}`)).json().note).toBe("great lighting");

    await call("PUT", `/api/media-items/${id}/note`, { note: "   " });
    expect((await call("GET", `/api/media-items/${id}`)).json().note).toBeNull();
  });

  it("is found by search, for its own profile only", async () => {
    const id = await makeItem(libraryId, { title: "Untitled clip" });
    await makeItem(libraryId, { title: "Other" });
    await call("PUT", `/api/media-items/${id}/note`, { note: "rooftop sunset" });

    expect(titles((await call("GET", "/api/media-items?q=rooftop")).json())).toEqual(["Untitled clip"]);

    const guest = await signInOtherProfile();
    expect(titles((await call("GET", "/api/media-items?q=rooftop", undefined, guest.cookie)).json())).toEqual([]);
    expect((await call("GET", `/api/media-items/${id}`, undefined, guest.cookie)).json().note).toBeNull();
  });

  it("refuses bad bodies, notes past the limit, and vault items", async () => {
    const id = await makeItem(libraryId);
    const hidden = await makeItem(libraryId, { hiddenAt: new Date() });
    expect((await call("PUT", `/api/media-items/${id}/note`, { note: 5 })).statusCode).toBe(400);
    expect((await call("PUT", `/api/media-items/${id}/note`, { note: "x".repeat(10_001) })).statusCode).toBe(400);
    expect((await call("PUT", `/api/media-items/${hidden}/note`, { note: "hi" })).statusCode).toBe(404);
    expect((await call("PUT", "/api/media-items/999999/note", { note: "hi" })).statusCode).toBe(404);
  });
});

describe("private notes on performers", () => {
  it("any profile may write its own, and only sees its own", async () => {
    const performerId = await makePerformer("Alice");
    const guest = await signInOtherProfile();

    expect((await call("PUT", `/api/performers/${performerId}/note`, { note: "owner's" })).statusCode).toBe(200);
    expect((await call("PUT", `/api/performers/${performerId}/note`, { note: "guest's" }, guest.cookie)).statusCode).toBe(200);

    expect((await call("GET", `/api/performers/${performerId}`)).json().note).toBe("owner's");
    expect((await call("GET", `/api/performers/${performerId}`, undefined, guest.cookie)).json().note).toBe("guest's");
  });

  it("answers 404 for an unknown performer", async () => {
    expect((await call("PUT", "/api/performers/999999/note", { note: "hi" })).statusCode).toBe(404);
  });
});
