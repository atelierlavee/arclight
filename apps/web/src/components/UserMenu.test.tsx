import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";
import { UserMenu } from "./UserMenu";
import { ToastProvider } from "@/lib/toast";
import { qk } from "@/lib/queryKeys";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAccount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(qk.authStatus, {
    needsSetup: false,
    user: { id: 1, username: "Tester" },
  });
  client.setQueryData(qk.privacy, { hasPassword: false });
  client.setQueryData(qk.passkeys, []);
  client.setQueryData(qk.mediaItems.all, { items: [{ id: 1 }] });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthGate>
          <UserMenu />
          <p>Private library</p>
        </AuthGate>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return client;
}

describe("UserMenu logout", () => {
  it("shows the login form immediately and removes cached library data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const client = renderAccount();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await screen.findByRole("heading", { name: "Sign in" });
    expect(screen.queryByText("Private library")).not.toBeInTheDocument();
    expect(client.getQueryData(qk.mediaItems.all)).toBeUndefined();
    expect(client.getQueryData(qk.authStatus)).toEqual({
      needsSetup: false,
      user: null,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    client.clear();
  });

  it("keeps the session and library when logout fails and reports the error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const client = renderAccount();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Account" }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await screen.findByText("Could not sign out");
    expect(screen.getByText("Failed to sign out: 500")).toBeInTheDocument();
    expect(screen.getByText("Private library")).toBeInTheDocument();
    expect(client.getQueryData(qk.mediaItems.all)).toBeDefined();
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeEnabled());
    client.clear();
  });
});
