// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loginWithPasskey } from "@/lib/webauthnApi";
import { AuthGate } from "./AuthGate";
import { qk } from "@/lib/queryKeys";

vi.mock("@/lib/webauthnApi", () => ({
  fetchPasskeys: vi.fn(),
  loginWithPasskey: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

function renderGate(needsSetup = false, recovery = { authenticator: false }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(qk.authStatus, { needsSetup, user: null, recovery });
  client.setQueryData(qk.privacy, { hasPassword: false });
  client.setQueryData(qk.passkeys, []);
  render(
    <QueryClientProvider client={client}>
      <AuthGate><p>Private library</p></AuthGate>
    </QueryClientProvider>,
  );
  return client;
}

describe("passkey login screen", () => {
  it("signs in without username or password and refreshes auth status", async () => {
    const client = renderGate();
    vi.mocked(loginWithPasskey).mockResolvedValue();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ needsSetup: false, user: { id: 1, username: "Tester" } }),
    }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Use a passkey instead" }));
    await screen.findByText("Private library");
    expect(loginWithPasskey).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it("shows failures and leaves password sign-in available", async () => {
    const client = renderGate();
    vi.mocked(loginWithPasskey).mockRejectedValue(new Error("No passkey registered"));
    await userEvent.setup().click(screen.getByRole("button", { name: "Use a passkey instead" }));
    await screen.findByText("No passkey registered");
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    client.clear();
  });

  it("does not offer passkey sign-in during first-time setup", () => {
    const client = renderGate(true);
    expect(screen.queryByRole("button", { name: "Use a passkey instead" })).not.toBeInTheDocument();
    client.clear();
  });
});

describe("forgot password", () => {
  it("asks the server for a code, says where to find it, then resets and signs in", async () => {
    const client = renderGate();
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/auth/recover/code") return { ok: true, json: async () => ({ ok: true }) };
      if (url === "/api/auth/recover") return { ok: true, json: async () => ({ user: { id: 1, username: "me" } }) };
      return { ok: true, json: async () => ({ needsSetup: false, user: { id: 1, username: "me" } }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();
    // Only the server route is offered while no authenticator is set up.
    expect(screen.queryByRole("tab", { name: /Authenticator app/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Get a reset code" }));
    await screen.findByText("A code was written to the server");
    expect(screen.getByText("backups/password-reset.txt")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Reset code"), "abcd-efgh");
    await user.type(screen.getByLabelText("New password"), "brand-new-pw");
    await user.type(screen.getByLabelText("Confirm new password"), "brand-new-pw");
    await user.click(screen.getByRole("button", { name: "Reset password and sign in" }));

    await screen.findByText("Private library");
    const resetCall = fetchMock.mock.calls.find(([url]) => url === "/api/auth/recover") as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(resetCall[1].body)).toEqual({ method: "server", code: "ABCD-EFGH", newPassword: "brand-new-pw" });
    client.clear();
  });

  it("offers the authenticator first once one is set up", async () => {
    const client = renderGate(false, { authenticator: true });
    await userEvent.setup().click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("tab", { name: /Authenticator app/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Code from your authenticator app")).toBeInTheDocument();
    client.clear();
  });

  it("checks the new passwords match before sending anything", async () => {
    const client = renderGate(false, { authenticator: true });
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Code from your authenticator app"), "123456");
    await user.type(screen.getByLabelText("New password"), "brand-new-pw");
    await user.type(screen.getByLabelText("Confirm new password"), "different-pw");
    await user.click(screen.getByRole("button", { name: "Reset password and sign in" }));
    expect(screen.getByText("Passwords don’t match")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    client.clear();
  });

  it("isn't offered during first-time setup", () => {
    const client = renderGate(true);
    expect(screen.queryByRole("button", { name: "Forgot password?" })).not.toBeInTheDocument();
    client.clear();
  });
});
