// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://media:media@localhost:5432/media",
  },
});
