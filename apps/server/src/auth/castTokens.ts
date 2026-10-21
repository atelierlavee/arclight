import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { decodedPath } from "./paths.js";

/**
 * Short-lived links that let a TV stream one video without a session.
 *
 * Casting from an Android phone, or AirPlay from Safari, hands the video's
 * URL to the TV, and the TV fetches it itself. It has none of the browser's
 * cookies, so behind the session guard it would get a 401 and play nothing.
 * A token in the URL stands in for the session — but only for GET/HEAD of
 * that one video's stream, and only until it expires.
 *
 * The signing key is made fresh at every start rather than stored. Nothing
 * needs a cast link to outlive a restart, and a key that never touches disk
 * cannot leak from a backup.
 */

const SECRET = randomBytes(32);
/** Long enough for a feature-length film with pauses; short enough that a stray link goes stale. */
const LIFETIME_SECONDS = 6 * 60 * 60;

function signature(itemId: number, expires: number): Buffer {
  return createHmac("sha256", SECRET).update(`cast:${itemId}:${expires}`).digest();
}

/** A `cast` query value for this item: `<expiry>.<signature>`. */
export function signCastToken(itemId: number, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + LIFETIME_SECONDS;
  return `${expires}.${signature(itemId, expires).toString("base64url")}`;
}

export function verifyCastToken(itemId: number, token: string, now = Date.now()): boolean {
  const [expiresText, sig] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isInteger(expires) || !sig || expires < Math.floor(now / 1000)) return false;
  const given = Buffer.from(sig, "base64url");
  const expected = signature(itemId, expires);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Whether a request is a stream fetch carrying a valid cast token for the
 * video it names. Parsed from the raw URL, because the guards that ask run
 * before Fastify has routed the request — but decoded the way the router
 * will decode it, so the id checked against the token is the id the stream
 * handler will actually serve, whichever way the path was spelled.
 */
export function isAuthorisedCastStream(method: string, rawUrl: string): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  // Split by hand rather than through `new URL`, which would read a path
  // starting with "//" as a hostname and check a different path than the
  // router sees.
  const queryAt = rawUrl.indexOf("?");
  const pathname = decodedPath(queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt));
  const match = pathname === null ? null : /^\/api\/stream\/(\d+)$/.exec(pathname);
  const token = queryAt === -1 ? null : new URLSearchParams(rawUrl.slice(queryAt + 1)).get("cast");
  return match !== null && token !== null && verifyCastToken(Number(match[1]), token);
}
