// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { readdir } from "node:fs/promises";
import path from "node:path";

/**
 * Yields every file under `root`.
 *
 * A directory that can't be read (unplugged drive, permissions, I/O error) is
 * skipped, but its path is added to `unreadable` when given. Callers that go
 * on to declare unseen files "missing" must consult it: an unreadable folder
 * looks identical to an empty one, and treating it as empty would flag the
 * whole library as gone.
 */
export async function* walk(
  root: string,
  unreadable?: Set<string>,
): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    unreadable?.add(root);
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath, unreadable);
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}
