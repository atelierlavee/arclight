// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { classifyByExtension, mimeTypeFor, titleFromFilename } from "./classify.js";

describe("classifyByExtension", () => {
  it("recognises video and photo extensions regardless of case", () => {
    expect(classifyByExtension("/m/a.mp4")).toBe("video");
    expect(classifyByExtension("/m/a.MKV")).toBe("video");
    expect(classifyByExtension("/m/a.jpg")).toBe("photo");
    expect(classifyByExtension("/m/a.HEIC")).toBe("photo");
  });

  it("skips anything else rather than throwing", () => {
    expect(classifyByExtension("/m/notes.txt")).toBeNull();
    expect(classifyByExtension("/m/no-extension")).toBeNull();
  });
});

describe("titleFromFilename", () => {
  it("uses the declared title when the convention applies", () => {
    expect(titleFromFilename("/m/[Vixen] Alice - 02.15.2020 - Real Title.mp4")).toBe("Real Title");
  });

  it("falls back to a cleaned-up filename otherwise", () => {
    expect(titleFromFilename("/m/some_file-name.mp4")).toBe("some file name");
  });
});

describe("mimeTypeFor", () => {
  it("maps known extensions and falls back to octet-stream", () => {
    expect(mimeTypeFor("/m/a.mp4")).toBe("video/mp4");
    expect(mimeTypeFor("/m/a.unknown")).toBe("application/octet-stream");
  });
});
