/**
 * Lazily drops expired entries from an in-memory map.
 *
 * The unlock windows, attempt counters and pending challenges all live in
 * plain Maps, and each only ever deleted an entry when that same key was
 * looked up again. A session that unlocked once and was never seen again —
 * or a stream of throwaway sessions — left its entry behind for the life of
 * the process. Nothing here is large, but "grows until restart" is not a
 * property anything reachable over the network should have.
 *
 * Swept on access rather than from a timer: there is no interval to unref or
 * stop in tests, and a map nobody touches is not growing. Throttled so a busy
 * path pays for a full scan at most once a minute.
 */
export function sweeper<K, V>(
  map: Map<K, V>,
  expired: (value: V, now: number) => boolean,
  everyMs = 60_000,
): () => void {
  let last = 0;
  return () => {
    const now = Date.now();
    if (now - last < everyMs) return;
    last = now;
    for (const [key, value] of map) {
      if (expired(value, now)) map.delete(key);
    }
  };
}
