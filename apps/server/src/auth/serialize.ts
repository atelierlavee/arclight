/**
 * Runs `fn` after every earlier call with the same key has finished.
 *
 * Attempt throttles read a counter, await a slow password check, and only
 * then record the failure. Fired in parallel, every request reads the counter
 * before the first failure lands, so ten thousand guesses all pass a limit of
 * five. Serialising the check-verify-record sequence per key makes each
 * attempt see the failures before it.
 */
const tails = new Map<string, Promise<unknown>>();

export function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  // The stored tail never rejects, so one failed attempt can't wedge the key.
  const tail = run.catch(() => undefined);
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return run;
}
