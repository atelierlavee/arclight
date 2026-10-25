/**
 * Whether an error is Postgres' unique-constraint violation (SQLSTATE 23505).
 *
 * Check-then-insert can't stop two concurrent requests both passing the check;
 * the unique index is what actually decides, and its failure should read as
 * the same 409 the up-front check gives rather than as a 500.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  // drizzle wraps the driver error, keeping it in `cause`.
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
