import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Routes must ask library/visibility.ts what is visible, not spell it out.
 *
 * The visibility rule has grown a column at a time — in scope, then not
 * missing, then not hidden — and every query that wrote the rule out by hand
 * froze it at whatever it was that day. That is how the storage, duplicates
 * and performer-network views came to leak vault items. This reads the route
 * files and fails when one filters on scope and missing-ness itself, so the
 * next hand-rolled copy is caught in review rather than in the vault.
 *
 * Static and approximate on purpose: it looks for the filter shapes the code
 * actually uses (Drizzle `eq(x.inScope, …)` / `isNull(x.missingSince)` and
 * their raw-SQL spellings), after stripping comments.
 */

const API_DIR = path.resolve(import.meta.dirname, "../api");

/**
 * Files allowed to filter by hand, and why. Each of these wants a set of items
 * that is deliberately *not* "what the library shows", so visibleItems()
 * would be the wrong answer rather than a missed helper.
 */
const EXEMPT: Record<string, string> = {
  // The vault's own listing: hidden items that are otherwise visible — the
  // inverse of visibleItems() on one column, which no helper expresses.
  "vault.ts": "lists hidden items, i.e. the complement of visibleItems() on hidden_at",
  // Library health counts missing videos, which visibleItems() excludes by
  // definition.
  "stats.ts": "counts missing videos for library health",
};

const SCOPE_FILTER = /\beq\(\s*\w+\.inScope\b|\.inScope\}\s*=|\bin_scope\s*(=|is\b)/;
const MISSING_FILTER =
  /\bis(Not)?Null\(\s*\w+\.missingSince\s*\)|\.missingSince\}\s+is\b|\bmissing_since\s+is\b/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function routeFiles(): string[] {
  return readdirSync(API_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
}

describe("visibility rule drift", () => {
  it("finds the route files", () => {
    expect(routeFiles().length).toBeGreaterThan(20);
  });

  it("no route file filters on scope and missing-ness by hand", () => {
    const offenders = routeFiles().filter((file) => {
      if (file in EXEMPT) return false;
      const code = stripComments(readFileSync(path.join(API_DIR, file), "utf8"));
      return SCOPE_FILTER.test(code) && MISSING_FILTER.test(code);
    });
    expect(
      offenders,
      "use visibleItems()/visibleItemsSql()/notMissing() from library/visibility.ts, " +
        "or add the file to EXEMPT with the reason",
    ).toEqual([]);
  });

  it("every exemption is still needed", () => {
    // A stale exemption would quietly cover a file that later starts
    // hand-rolling the rule for no good reason.
    const unneeded = Object.keys(EXEMPT).filter((file) => {
      const code = stripComments(readFileSync(path.join(API_DIR, file), "utf8"));
      return !(SCOPE_FILTER.test(code) && MISSING_FILTER.test(code));
    });
    expect(unneeded).toEqual([]);
  });

  it("the patterns catch the shapes they are meant to", () => {
    const drizzle = "and(eq(mediaItems.inScope, true), isNull(mediaItems.missingSince))";
    const raw = "where m.in_scope = true and m.missing_since is null";
    const template = "sql`${mediaItems.inScope} = true and ${mediaItems.missingSince} is null`";
    for (const code of [drizzle, raw, template]) {
      expect(SCOPE_FILTER.test(code) && MISSING_FILTER.test(code), code).toBe(true);
    }
    // Selecting the column to report it is not filtering on it.
    expect(MISSING_FILTER.test("missingSince: mediaItems.missingSince,")).toBe(false);
  });
});

/**
 * "Hidden" is per profile (profile_item_state), and only means anything for
 * the profile asking. A query that reads hidden_at by hand can easily forget
 * the profile and hide one person's vault from everybody — or, worse, show
 * it. So outside the helpers, only these files may touch it, each because it
 * lists the vault itself rather than filtering it out.
 */
const HIDDEN_STATE_ALLOWED: Record<string, string> = {
  "library/profileState.ts": "the helpers themselves",
  "api/vault.ts": "lists this profile's vault",
  "api/missing.ts": "drops this profile's vault items from the missing list",
  "activity/log.ts": "drops this profile's vault items from the log",
};

const HIDDEN_STATE = /\bprofileItemState\.hiddenAt\b|\bhidden_at\b/;
const SRC_DIR = path.resolve(import.meta.dirname, "..");

function sourceFiles(dir = SRC_DIR, prefix = ""): string[] {
  return readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return rel === "db" || rel === "test" ? [] : sourceFiles(dir, rel);
    return rel.endsWith(".ts") && !rel.endsWith(".test.ts") ? [rel] : [];
  });
}

describe("per-profile hidden state drift", () => {
  it("only the vault's own listings read hidden_at outside library/profileState.ts", () => {
    const offenders = sourceFiles().filter((file) => {
      if (file in HIDDEN_STATE_ALLOWED) return false;
      return HIDDEN_STATE.test(stripComments(readFileSync(path.join(SRC_DIR, file), "utf8")));
    });
    expect(
      offenders,
      "use visibleItems(profile)/notHidden(profile)/hiddenGate(request) or the profileState helpers",
    ).toEqual([]);
  });

  it("every allowance is still needed", () => {
    const unneeded = Object.keys(HIDDEN_STATE_ALLOWED).filter(
      (file) => !HIDDEN_STATE.test(stripComments(readFileSync(path.join(SRC_DIR, file), "utf8"))),
    );
    expect(unneeded).toEqual([]);
  });
});
