// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QueueProvider } from "@/lib/queue";
import { ToastProvider } from "@/lib/toast";
import { openDetails, openWatchPage } from "@/lib/appEvents";
import { AppLayout, AppShell } from "./AppShell";

// The frame's own children are not what is under test, and most of them
// fetch on mount. Each stand-in counts its mounts, so a remount on
// navigation — the bug the layout exists to fix — shows up as a second one.
const mounts = vi.hoisted(() => ({ screensaver: 0 }));
vi.mock("./Screensaver", async () => {
  const { useEffect } = await import("react");
  return {
    Screensaver: () => {
      useEffect(() => {
        mounts.screensaver += 1;
      }, []);
      return <div data-testid="screensaver" />;
    },
  };
});
vi.mock("./Sidebar", () => ({ Sidebar: () => null }));
vi.mock("./AppFooter", () => ({ AppFooter: () => null }));
vi.mock("./UserMenu", () => ({ UserMenu: () => null }));
vi.mock("./NotificationCenter", () => ({ NotificationCenter: () => null }));
vi.mock("./AppearanceMenu", () => ({ AppearanceMenu: () => null }));
vi.mock("./DiscreetUnlockDialog", () => ({ DiscreetUnlockDialog: () => null }));
vi.mock("./PrivacyUnlockPrompt", () => ({ PrivacyUnlockPrompt: () => null }));
vi.mock("./SpotlightSearch", () => ({
  SpotlightSearch: () => null,
  openSpotlight: () => {},
}));
vi.mock("./MediaPlayer", () => ({ MediaPlayer: () => null }));
vi.mock("@/lib/useAchievementWatcher", () => ({ useAchievementWatcher: () => {} }));

function renderApp() {
  const rootRoute = createRootRoute({ component: AppLayout });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => (
        <AppShell title="First page" actions={<button type="button">Page action</button>}>
          <p>first body</p>
        </AppShell>
      ),
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/second",
      component: () => (
        <AppShell title="Second page" subtitle="Sub">
          <p>second body</p>
        </AppShell>
      ),
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/watch/$itemId",
      component: () => <p>watch player</p>,
    }),
  ]);
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <QueueProvider>
          <RouterProvider router={router} />
        </QueueProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe("AppLayout", () => {
  it("routes detail and play requests to the watch page", async () => {
    const router = renderApp();
    expect(await screen.findByText("first body")).toBeInTheDocument();

    act(() => openDetails(42));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/watch/42");
    });
    expect(router.state.location.search).toEqual({});

    act(() => openWatchPage(17, { resume: true }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/watch/17");
    });
    expect(router.state.location.search).toEqual({ autoplay: true, resume: true });
    expect(await screen.findByText("watch player")).toBeInTheDocument();
  });

  it("renders the page's header once and keeps the frame mounted across navigation", async () => {
    mounts.screensaver = 0;
    const router = renderApp();

    expect(await screen.findByText("first body")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "First page" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Page action" })).toHaveLength(1);
    expect(screen.getAllByTestId("screensaver")).toHaveLength(1);

    await act(async () => router.history.push("/second"));

    expect(await screen.findByText("second body")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Second page" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "First page" })).not.toBeInTheDocument();
    // The outgoing page's actions leave with it.
    expect(screen.queryByRole("button", { name: "Page action" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("screensaver")).toHaveLength(1);
    expect(mounts.screensaver).toBe(1);
  });
});
