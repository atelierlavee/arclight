// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

/**
 * Shared setup for the component tests.
 *
 * Each of these globals is one the app reads on mount, so leaving state in
 * them between files makes tests pass or fail depending on the order vitest
 * happened to run them in.
 */

// jsdom implements neither, and the virtualized grid constructs both on mount.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

vi.stubGlobal("ResizeObserver", NoopObserver);
vi.stubGlobal("IntersectionObserver", NoopObserver);
// jsdom has no layout engine, so nothing scrolls; the grid and the lightbox
// both call this and would otherwise throw.
vi.stubGlobal("scrollTo", () => {});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});
