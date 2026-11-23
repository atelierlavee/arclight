// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  hasWordBoundaryMatch,
  isUsableMatchKey,
  matchKey,
  normalizeName,
  parseDateToken,
  parseDeclaredName,
  performerNameFromPath,
  releaseDateFromFilename,
  studioNameFromFilename,
  studioNameFromPath,
} from "./performerNames.js";

const ROOT = "/media";

describe("normalizeName", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeName("  Little   Caprice ")).toBe("Little Caprice");
  });

  it("composes to NFC so macOS decomposed names match typed ones", () => {
    // readdir returns decomposed on macOS; the browser sends composed.
    const decomposed = "José";
    expect(normalizeName(decomposed)).toBe("José");
    expect(normalizeName(decomposed).length).toBe(4);
  });
});

describe("performerNameFromPath", () => {
  it("takes the first segment below the root", () => {
    expect(performerNameFromPath(ROOT, `${ROOT}/Alice/a.mp4`)).toBe("Alice");
  });

  it("ignores depth beyond the first segment", () => {
    expect(performerNameFromPath(ROOT, `${ROOT}/Alice/Vixen/2019/a.mp4`)).toBe("Alice");
  });

  it("returns null for a file sitting at the root", () => {
    expect(performerNameFromPath(ROOT, `${ROOT}/a.mp4`)).toBeNull();
  });

  it("rejects bookkeeping directories and bare years", () => {
    expect(performerNameFromPath(ROOT, `${ROOT}/.Trash-1000/a.mp4`)).toBeNull();
    expect(performerNameFromPath(ROOT, `${ROOT}/@eaDir/a.mp4`)).toBeNull();
    expect(performerNameFromPath(ROOT, `${ROOT}/2019/a.mp4`)).toBeNull();
  });

  it("refuses a path that escapes the root", () => {
    expect(performerNameFromPath(ROOT, "/elsewhere/Alice/a.mp4")).toBeNull();
  });
});

describe("studioNameFromPath", () => {
  it("takes the second segment when a file is nested that deep", () => {
    expect(studioNameFromPath(ROOT, `${ROOT}/Alice/Vixen/a.mp4`)).toBe("Vixen");
  });

  it("returns null when there is no studio folder", () => {
    expect(studioNameFromPath(ROOT, `${ROOT}/Alice/a.mp4`)).toBeNull();
  });

  it("rejects a bare year folder as a studio", () => {
    expect(studioNameFromPath(ROOT, `${ROOT}/Alice/2019/a.mp4`)).toBeNull();
  });
});

describe("studioNameFromFilename", () => {
  it("reads the first bracket group", () => {
    expect(studioNameFromFilename("/m/Alice - [Vixen] - Title.mp4")).toBe("Vixen");
  });

  it("ignores a bracketed resolution", () => {
    expect(studioNameFromFilename("/m/Alice - Title [1080p].mp4")).toBeNull();
  });

  it("returns null with no brackets at all", () => {
    expect(studioNameFromFilename("/m/Alice - Title.mp4")).toBeNull();
  });
});

describe("parseDateToken", () => {
  it("reads MM.DD.YYYY, the declared convention", () => {
    expect(parseDateToken("02.15.2020")).toBe("2020-02-15");
  });

  it("reads YYYY.MM.DD, used by older filenames", () => {
    expect(parseDateToken("2018.09.06")).toBe("2018-09-06");
  });

  it("accepts dashes and underscores as separators", () => {
    expect(parseDateToken("2018-09-06")).toBe("2018-09-06");
    expect(parseDateToken("02_15_2020")).toBe("2020-02-15");
  });

  it("rejects out-of-range months and days rather than clamping", () => {
    expect(parseDateToken("13.45.2020")).toBeNull();
  });

  it("rejects a day that does not exist in that month", () => {
    // Date() would roll this to March 2nd, which is silently wrong.
    expect(parseDateToken("02.31.2020")).toBeNull();
  });

  it("accepts a real leap day", () => {
    expect(parseDateToken("02.29.2020")).toBe("2020-02-29");
  });

  it("rejects two-digit years instead of guessing a century", () => {
    expect(parseDateToken("12.03.17")).toBeNull();
  });

  it("rejects anything that is not three numeric parts", () => {
    expect(parseDateToken("hello")).toBeNull();
    expect(parseDateToken("2020")).toBeNull();
  });
});

describe("releaseDateFromFilename", () => {
  it("finds a date anywhere in a non-convention filename", () => {
    expect(releaseDateFromFilename("/m/Alice - [Vixen] - 2018.09.06 - Title.mp4")).toBe(
      "2018-09-06"
    );
  });

  it("returns null when nothing in the name is a date", () => {
    expect(releaseDateFromFilename("/m/BLACKED_100688-ABELLA_1080P.mp4")).toBeNull();
    expect(releaseDateFromFilename("/m/Alice - Title.mp4")).toBeNull();
  });
});

describe("parseDeclaredName", () => {
  it("returns null unless the filename opts in with a leading bracket", () => {
    expect(parseDeclaredName("/m/Alice - [Vixen] - Title.mp4")).toBeNull();
    expect(parseDeclaredName("/m/Alice.mp4")).toBeNull();
  });

  it("reads studio, cast, date and title", () => {
    expect(parseDeclaredName("/m/[Vixen] Alice, Bella - 02.15.2020 - The Title.mp4")).toEqual({
      studio: "Vixen",
      performerNames: ["Alice", "Bella"],
      releaseDate: "2020-02-15",
      title: "The Title",
    });
  });

  it("treats the date as optional", () => {
    const parsed = parseDeclaredName("/m/[Vixen] Alice, Bella - The Title.mp4");
    expect(parsed?.releaseDate).toBeNull();
    expect(parsed?.title).toBe("The Title");
    expect(parsed?.performerNames).toEqual(["Alice", "Bella"]);
  });

  it("keeps dashes inside the title", () => {
    expect(parseDeclaredName("/m/[C] Alice - 12.14.2015 - Girls - Girls - Girls.mp4")?.title).toBe(
      "Girls - Girls - Girls"
    );
  });

  it("does not eat a title segment that merely looks numeric", () => {
    const parsed = parseDeclaredName("/m/[Vixen] Alice - 2 Girls - A Title.mp4");
    expect(parsed?.releaseDate).toBeNull();
    expect(parsed?.title).toBe("2 Girls - A Title");
  });

  it("leaves an unparseable date in the title rather than dropping it", () => {
    expect(parseDeclaredName("/m/[Vixen] Alice - 13.45.2020 - Bad.mp4")?.title).toBe(
      "13.45.2020 - Bad"
    );
  });

  it("treats an empty bracket as 'no studio' while still opting in", () => {
    const parsed = parseDeclaredName("/m/[] Alice - The Title.mp4");
    expect(parsed?.studio).toBeNull();
    expect(parsed?.performerNames).toEqual(["Alice"]);
  });

  it("tolerates sloppy spacing around the commas", () => {
    expect(
      parseDeclaredName("/m/[V] Alice ,  Bella  - Title.mp4")?.performerNames
    ).toEqual(["Alice", "Bella"]);
  });

  it("drops a resolution token sitting in the performer slot", () => {
    expect(parseDeclaredName("/m/[V] 1080p - Title.mp4")?.performerNames).toEqual([]);
  });

  it("returns null when the bracket is never closed", () => {
    expect(parseDeclaredName("/m/[Vixen Alice - Title.mp4")).toBeNull();
  });

  it("falls back to the cast segment for the title when there is no dash", () => {
    expect(parseDeclaredName("/m/[Vixen] Alice.mp4")?.title).toBe("Alice");
  });
});

describe("matchKey and matching helpers", () => {
  it("flattens separators and strips diacritics", () => {
    expect(matchKey("Dani.Daniels-2019_HD")).toBe("dani daniels 2019 hd");
    expect(matchKey("Renée")).toBe("renee");
  });

  it("rejects keys too short to match usefully", () => {
    expect(isUsableMatchKey("al")).toBe(false);
    expect(isUsableMatchKey("ana")).toBe(true);
  });

  it("matches on word boundaries, not substrings", () => {
    expect(hasWordBoundaryMatch("ana foxxx scene", "ana")).toBe(true);
    expect(hasWordBoundaryMatch("anastasia scene", "ana")).toBe(false);
  });

  it("does not treat regex metacharacters in a name as syntax", () => {
    expect(hasWordBoundaryMatch("anna (uk) scene", "anna (uk)")).toBe(true);
  });
});

// The inbox suggests names in this shape (web/src/lib/suggestedFilename.ts);
// these are the exact strings it produces, so a rename the page asks for is one
// the scanner reads back in full.
describe("names suggested by the inbox", () => {
  const read = (name: string) => parseDeclaredName(`/media/${name}`);

  it("read back as studio, cast, date and title", () => {
    expect(read("[X-Art] Little Caprice - 12.25.2018 - Once A Year.mp4")).toEqual({
      studio: "X-Art",
      performerNames: ["Little Caprice"],
      releaseDate: "2018-12-25",
      title: "Once A Year",
    });
    expect(read("[X-Art] Ann, Bea - Once A Year.mkv")).toMatchObject({
      performerNames: ["Ann", "Bea"],
      releaseDate: null,
      title: "Once A Year",
    });
  });

  it("read back with no cast", () => {
    expect(read("[X-Art] - 12.25.2018 - Once A Year.mp4")).toMatchObject({
      studio: "X-Art",
      performerNames: [],
      releaseDate: "2018-12-25",
      title: "Once A Year",
    });
    expect(read("[X-Art] - Once A Year.mp4")).toMatchObject({ performerNames: [], title: "Once A Year" });
  });

  it("keep a title that contains dashes", () => {
    expect(read("[X-Art] Little Caprice - 12.25.2018 - Girls - Girls - Girls.mp4")).toMatchObject({
      performerNames: ["Little Caprice"],
      title: "Girls - Girls - Girls",
    });
  });
});
