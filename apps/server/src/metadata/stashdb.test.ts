// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { isListedPerformer, mapScene } from "./stashdb.js";

const performer = (name: string, gender: string | null) => ({
  performer: { name, disambiguation: null, gender },
});

describe("mapScene", () => {
  it("lists women only, leaving out male performers", () => {
    const scene = mapScene({
      id: "1",
      title: "A Lovely Time Of Year",
      details: null,
      date: "2022-12-10",
      studio: { name: "Freeuse Fantasy" },
      performers: [
        performer("Nikki Zee", "FEMALE"),
        performer("Kay Lovely", "FEMALE"),
        performer("Tommy Gunn", "MALE"),
        performer("Some One", "TRANSGENDER_MALE"),
      ],
      tags: [],
    });
    expect(scene.performers).toEqual(["Nikki Zee", "Kay Lovely"]);
  });

  it("lists only those StashDB marks female", () => {
    expect(isListedPerformer("FEMALE")).toBe(true);
    for (const other of [null, "MALE", "TRANSGENDER_FEMALE", "TRANSGENDER_MALE", "NON_BINARY", "INTERSEX"]) {
      expect(isListedPerformer(other)).toBe(false);
    }
  });
});
