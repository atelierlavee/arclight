// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import {
  closeAllTranscodeSessions,
  createTranscodeSession,
  getTranscodeSession,
  TranscodeCapacityError,
} from "./transcode.js";

// Creating a session only reserves a slot and a directory; nothing reads the
// source until a segment is asked for, so no real video is needed here.
const SOURCE = "/nowhere/video.mp4";

afterEach(async () => {
  await closeAllTranscodeSessions();
});

describe("transcode session capacity", () => {
  it("lets a profile's new session replace the one it left behind", async () => {
    const first = await createTranscodeSession(1, 7, SOURCE, 60);
    const second = await createTranscodeSession(2, 7, SOURCE, 60);

    // Full — but both are this profile's, so the oldest makes room.
    const third = await createTranscodeSession(3, 7, SOURCE, 60);

    expect(getTranscodeSession(first, 7)).toBeNull();
    expect(getTranscodeSession(second, 7)).not.toBeNull();
    expect(getTranscodeSession(third, 7)).not.toBeNull();
  });

  it("never closes someone else's session to make room", async () => {
    const theirs = await createTranscodeSession(1, 8, SOURCE, 60);
    const alsoTheirs = await createTranscodeSession(2, 8, SOURCE, 60);

    await expect(createTranscodeSession(3, 7, SOURCE, 60)).rejects.toBeInstanceOf(
      TranscodeCapacityError,
    );
    expect(getTranscodeSession(theirs, 8)).not.toBeNull();
    expect(getTranscodeSession(alsoTheirs, 8)).not.toBeNull();
  });
});
