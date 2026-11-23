// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

/**
 * Test configuration, separate from vite.config.ts.
 *
 * Merged from it rather than restated, so the `@` alias and the React plugin
 * stay in one place — a second copy of the alias is how a test starts
 * resolving a different module than the app does.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      // Registers the jest-dom matchers and stubs the browser APIs jsdom
      // lacks but the components construct on mount.
      setupFiles: ["./src/test/setup.ts"],
    },
  }),
);
