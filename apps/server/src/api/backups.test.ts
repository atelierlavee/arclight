import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase, signIn, testApp } from "../test/harness.js";
import { db } from "../db/client.js";
import { activityEvents } from "../db/schema.js";
import { logActivity } from "../activity/log.js";

let app: FastifyInstance;
let cookie: string;

beforeAll(async () => {
  app = await testApp();
});
beforeEach(async () => {
  await resetDatabase();
  cookie = await signIn();
});

const call = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, payload });

// A name the backup routes accept, for a file that does not exist: enough to
// get past validation to the gate without having to build a real archive.
const NAME = "media-server-2026-01-01T00-00-00Z.tar.gz";

async function configurePrivacy() {
  const res = await call("PUT", "/api/privacy/password", {
    password: "privacy-long-enough",
    accountPassword: "test-password",
  });
  expect(res.statusCode).toBe(200);
}

describe("privacy gate on backups and the activity log", () => {
  it("refuses download, delete and clearing the log until the session unlocks", async () => {
    await configurePrivacy();
    await logActivity("vault", "something worth keeping");

    for (const [method, url] of [
      ["GET", `/api/backups/${NAME}`],
      ["DELETE", `/api/backups/${NAME}`],
      ["DELETE", "/api/activity"],
    ] as const) {
      const res = await call(method, url);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json().code).toBe("privacy_locked");
    }
    expect(await db.select().from(activityEvents)).not.toHaveLength(0);

    expect((await call("POST", "/api/privacy/unlock", { password: "privacy-long-enough" })).statusCode).toBe(200);

    expect((await call("DELETE", `/api/backups/${NAME}`)).statusCode).toBe(200);
    expect((await call("GET", `/api/backups/${NAME}`)).statusCode).not.toBe(403);
    expect((await call("DELETE", "/api/activity")).statusCode).toBe(200);
    expect(await db.select().from(activityEvents)).toHaveLength(0);
  });

  it("lets them through when no privacy credential exists", async () => {
    expect((await call("DELETE", `/api/backups/${NAME}`)).statusCode).toBe(200);
    expect((await call("DELETE", "/api/activity")).statusCode).toBe(200);
  });

  it("does not gate listing backups", async () => {
    await configurePrivacy();
    expect((await call("GET", "/api/backups")).statusCode).toBe(200);
  });
});
