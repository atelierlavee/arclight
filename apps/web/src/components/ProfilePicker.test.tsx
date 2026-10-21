import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";
import { BulkActionBar } from "./BulkActionBar";
import { UserMenu } from "./UserMenu";
import { ToastProvider } from "@/lib/toast";
import { ProfileContext } from "@/lib/profile";
import { qk } from "@/lib/queryKeys";
import { installFetchGuard } from "@/lib/fetchGuard";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const PROFILES = [
  { id: 1, name: "Alex", color: "#6366f1", isOwner: true, hasPin: false, position: 0 },
  { id: 2, name: "Sam", color: "#ec4899", isOwner: false, hasPin: true, position: 1 },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
}

function renderGate(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthGate>
          <UserMenu />
          <p>Private library</p>
        </AuthGate>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const signedIn = { needsSetup: false, user: { id: 1, username: "alex" } };

describe("Who's watching? picker", () => {
  it("shows when signed in with no profile selected, and enters on a tile", async () => {
    let selected = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/profiles") return json(PROFILES);
      if (url === "/api/profiles/1/select") {
        selected = true;
        return json({ ok: true });
      }
      if (url === "/api/auth/status") {
        return json({ ...signedIn, profile: selected ? { id: 1, name: "Alex", isOwner: true } : null });
      }
      if (url === "/api/privacy") return json({ hasPassword: false });
      if (url === "/api/webauthn/credentials") return json({ credentials: [] });
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = makeClient();
    client.setQueryData(qk.authStatus, { ...signedIn, profile: null });
    renderGate(client);

    expect(await screen.findByRole("heading", { name: "Who’s watching?" })).toBeInTheDocument();
    expect(screen.queryByText("Private library")).not.toBeInTheDocument();

    await userEvent.setup().click(await screen.findByRole("button", { name: "Alex" }));
    await screen.findByText("Private library");
    client.clear();
  });

  it("asks for the PIN, reports attempts left and counts down a lockout", async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/profiles") return json(PROFILES);
      if (url === "/api/profiles/2/select") {
        attempts += 1;
        return attempts === 1
          ? json({ code: "bad_pin", attemptsLeft: 2 }, 403)
          : json({ code: "pin_locked", retryAfterSeconds: 30 }, 429);
      }
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = makeClient();
    client.setQueryData(qk.authStatus, { ...signedIn, profile: null });
    renderGate(client);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Sam (PIN protected)" }));
    expect(screen.getByRole("heading", { name: "Enter Sam’s PIN" })).toBeInTheDocument();

    // Typed straight from the keyboard, no field to focus first.
    await user.keyboard("1234{Enter}");
    expect(await screen.findByText("Wrong PIN. 2 attempts left.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/profiles/2/select",
      expect.objectContaining({ body: JSON.stringify({ pin: "1234" }) }),
    );

    for (const digit of ["5", "6", "7", "8"]) {
      await user.click(screen.getByRole("button", { name: digit }));
    }
    await user.click(screen.getByRole("button", { name: "OK" }));
    expect(await screen.findByText("Too many attempts. Try again in 30s.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toBeDisabled();
    client.clear();
  });

  it("shows the picker when any request answers 409 profile_required", async () => {
    const original = window.fetch;
    window.fetch = vi.fn(async () => json({ code: "profile_required" }, 409)) as typeof fetch;
    const client = makeClient();
    client.setQueryData(qk.authStatus, { ...signedIn, profile: { id: 1, name: "Alex", isOwner: true } });
    client.setQueryData(qk.mediaItems.all, { items: [] });
    const uninstall = installFetchGuard(client);
    try {
      await window.fetch("/api/media-items");
      await waitFor(() =>
        expect(client.getQueryData(qk.authStatus)).toMatchObject({ profile: null }),
      );
      expect(client.getQueryData(qk.mediaItems.all)).toBeUndefined();
    } finally {
      uninstall();
      window.fetch = original;
      client.clear();
    }
  });
});

describe("switching profile", () => {
  it("deselects, clears the cache and the outgoing profile's session data", async () => {
    sessionStorage.setItem("p2:playback-queue", "[1]");
    sessionStorage.setItem("p2:browse-scroll:abc", "300");
    sessionStorage.setItem("p3:playback-queue", "[9]");
    localStorage.setItem("p2:recent-played", "[]");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/profiles") return json(PROFILES);
      if (url === "/api/profiles/deselect") return json({ ok: true });
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = makeClient();
    client.setQueryData(qk.authStatus, {
      ...signedIn,
      profile: { id: 2, name: "Sam", isOwner: false, color: "#ec4899" },
    });
    client.setQueryData(qk.privacy, { hasPassword: false });
    client.setQueryData(qk.passkeys, []);
    client.setQueryData(qk.mediaItems.all, { items: [{ id: 1 }] });
    renderGate(client);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Account" }));
    expect(screen.getByText("Sam")).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Switch profile" }));

    expect(await screen.findByRole("heading", { name: "Who’s watching?" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/profiles/deselect", { method: "POST" });
    expect(client.getQueryData(qk.mediaItems.all)).toBeUndefined();
    expect(client.getQueryData(qk.authStatus)).toMatchObject({ profile: null });
    expect(sessionStorage.getItem("p2:playback-queue")).toBeNull();
    expect(sessionStorage.getItem("p2:browse-scroll:abc")).toBeNull();
    // Someone else's session and the outgoing profile's own history stay.
    expect(sessionStorage.getItem("p3:playback-queue")).toBe("[9]");
    expect(localStorage.getItem("p2:recent-played")).toBe("[]");
    client.clear();
  });
});

describe("owner-only controls", () => {
  function renderBar(isOwner: boolean) {
    vi.stubGlobal("fetch", vi.fn(async () => json({ collections: [] })));
    const client = makeClient();
    render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <ProfileContext.Provider
            value={{
              profile: { id: isOwner ? 1 : 2, name: "x", isOwner },
              isOwner,
              switchProfile: async () => {},
            }}
          >
            <BulkActionBar selectedIds={[1, 2]} onDone={() => {}} />
          </ProfileContext.Provider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    return client;
  }

  it("hides bulk metadata editing from a non-owner but keeps personal actions", () => {
    const client = renderBar(false);
    expect(screen.queryByLabelText("Tag name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Performer name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Studio name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Favourite/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Rate the selection")).toBeInTheDocument();
    client.clear();
  });

  it("shows them to the owner", () => {
    const client = renderBar(true);
    expect(screen.getByLabelText("Tag name")).toBeInTheDocument();
    client.clear();
  });

  it("toasts a 403 owner_only from a write", async () => {
    const original = window.fetch;
    window.fetch = vi.fn(async () => json({ code: "owner_only" }, 403)) as typeof fetch;
    const client = makeClient();
    client.setQueryData(qk.authStatus, { ...signedIn, profile: { id: 2, name: "Sam", isOwner: false } });
    client.setQueryData(qk.privacy, { hasPassword: false });
    client.setQueryData(qk.passkeys, []);
    const uninstall = installFetchGuard(client);
    try {
      renderGate(client);
      await screen.findByText("Private library");
      await act(async () => {
        await window.fetch("/api/tags", { method: "POST" });
      });
      expect(await screen.findByText("Only the owner profile can do that")).toBeInTheDocument();
    } finally {
      uninstall();
      window.fetch = original;
      client.clear();
    }
  });
});
