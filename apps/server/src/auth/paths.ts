import path from "node:path";

/**
 * The request's path as the router will understand it, not as it was typed.
 *
 * Testing the raw URL is what let `/%61pi/media-items` through: the raw
 * string does not start with "/api/", so the guard waved it on, and then the
 * router percent-decoded it and ran the /api handler anyway. So this decodes,
 * folds backslashes and repeated slashes, and lower-cases — at least as much
 * as the router does, which is the safe direction: anything that could
 * conceivably reach an /api handler is treated as /api, and the worst a false
 * positive costs is a 401 on a path that would have 404'd anyway.
 *
 * Undecodable input yields null; callers treat that as "is /api" so a
 * malformed escape fails closed rather than open.
 */
export function decodedPath(rawUrl: string): string | null {
  const pathname = rawUrl.split("?")[0].split("#")[0];
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  return decoded.replace(/\\/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
}

/**
 * Whether a raw request URL could address the API. Unparseable counts as yes.
 *
 * Checked both before and after resolving dot segments: the router does not
 * resolve them, so `/api/../x` is an /api request as far as routing goes,
 * while `/x/../api/y` is one as far as anything downstream that does resolve
 * them is concerned. Either reading being /api is enough.
 */
export function isApiUrl(rawUrl: string): boolean {
  const decoded = decodedPath(rawUrl);
  if (decoded === null) return true;
  return [decoded, path.posix.normalize(decoded)].some(
    (candidate) => candidate === "/api" || candidate.startsWith("/api/"),
  );
}
