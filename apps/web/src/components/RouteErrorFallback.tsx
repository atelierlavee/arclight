// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import type { ErrorComponentProps } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { ErrorFallback } from "@/components/ErrorBoundary";

/**
 * Shown when a page component throws.
 *
 * Inside the shell on purpose: the sidebar and search keep working, so a
 * broken page is a dead panel rather than a dead app, and navigating away is
 * still possible without touching the URL bar.
 */
export function RouteErrorFallback({ error, reset }: ErrorComponentProps) {
  return (
    <AppShell title="This page didn't load">
      <ErrorFallback
        error={error instanceof Error ? error : new Error(String(error))}
        reset={reset}
        title="This page didn't load"
      />
    </AppShell>
  );
}
