import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InboxPage } from "./InboxPage";

// The URL's ?item=, as a tiny store: useSearch reads it, navigate writes it.
const router = vi.hoisted(() => {
  let search: { item?: number } = {};
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set: (next: { item?: number }) => {
      search = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const { useSyncExternalStore } = await import("react");
  return {
    ...(await importOriginal<typeof import("@tanstack/react-router")>()),
    getRouteApi: () => ({ useSearch: () => useSyncExternalStore(router.subscribe, router.get) }),
    useNavigate: () => (options: { search: { item?: number } }) => {
      router.set(options.search);
      return Promise.resolve();
    },
  };
});

vi.mock("@/components/AppShell", () => ({
  // Header actions render inline, as the real shell portals them into view.
  AppShell: ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
    <>
      {actions}
      {children}
    </>
  ),
}));
vi.mock("@/components/PerformerEditor", () => ({ PerformerEditor: () => <input aria-label="Add performer" /> }));
vi.mock("@/components/TagEditor", () => ({ TagEditor: () => <input aria-label="Add tag" /> }));
vi.mock("@/components/StarRating", () => ({ StarRating: () => <div aria-label="Rating" /> }));

const clients: QueryClient[] = [];
// afterEach unstubs every global, including the one test/setup.ts installs.
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  router.set({});
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function item(id: number, title: string) {
  return { id, title, description: id === 1 ? "A short synopsis." : null, thumbnailFile: null, thumbnailPositionX: 50, thumbnailPositionY: 50,
    thumbnailScale: 100, durationSeconds: 120, releaseDate: "2026-10-10", fileName: "x art caprice 1080.mp4", itemType: "video",
    studioId: id === 2 ? 7 : null, studioName: id === 2 ? "X-Art" : null, rating: null, isFavorite: false, performers: [], tags: [] };
}

function renderInbox({ hasMore = false, failTriage = false, stashDb = false } = {}) {
  let items = [item(1, "First video"), item(2, "Second video")];
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/inbox/triage") {
      if (failTriage) return new Response("", { status: 500 });
      const { ids } = JSON.parse(options?.body as string) as { ids: number[] };
      items = items.filter((entry) => !ids.includes(entry.id));
      return Response.json({ ok: true });
    }
    if (url === "/api/stashdb") return Response.json({ configured: stashDb });
    if (url.startsWith("/api/stashdb/scenes")) {
      return Response.json({ scenes: [{ id: "s", title: "First video", details: "From StashDB", date: "2018-12-25", url: "",
        studio: null, performers: [{ name: "Ann", inLibrary: true }, { name: "Newbie", inLibrary: false }], tags: [] }] });
    }
    if (url === "/api/media-items/1" && options?.method === "PATCH") return Response.json({ ok: true });
    if (url === "/api/media-items/1") {
      return Response.json({ id: 1, title: "First video", description: null, releaseDate: null, studio: null, performers: [{ id: 9, name: "Ann" }], tags: [] });
    }
    if (url === "/api/inbox/count") return Response.json({ count: items.length });
    if (url === "/api/inbox?page=2") return Response.json({ items: [item(3, "Third video")], page: 2, pageSize: 50, hasMore: false });
    if (url === "/api/inbox/locate?id=3") return Response.json({ page: 2 });
    return Response.json({ items, page: 1, pageSize: 50, hasMore });
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><InboxPage /></QueryClientProvider>);
  return fetchMock;
}

describe("inbox review workspace", () => {
  it("shows generated thumbnails without an uploaded override", async () => {
    renderInbox();
    expect(await screen.findByRole("img", { name: "First video" })).toHaveAttribute("src", expect.stringContaining("/api/media-items/1/thumbnail?v=auto"));
    expect(screen.getByRole("complementary", { name: "Review queue" })).toBeInTheDocument();
  });

  it("skips to the next item without marking anything done", async () => {
    const fetchMock = renderInbox();
    await screen.findByRole("heading", { name: "First video" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Skip for now" }));
    expect(screen.getByRole("heading", { name: "Second video" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/inbox/triage")).toBe(false);
  });

  it("removes a reviewed item and selects the next item", async () => {
    const fetchMock = renderInbox();
    await screen.findByRole("heading", { name: "First video" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark done" }));
    await screen.findByRole("heading", { name: "Second video" });
    expect(fetchMock).toHaveBeenCalledWith("/api/inbox/triage", expect.objectContaining({ body: JSON.stringify({ ids: [1] }) }));
    expect(within(screen.getByRole("complementary", { name: "Review queue" })).queryByText("First video")).not.toBeInTheDocument();
  });

  it("keeps the current item and shows an error when triage fails", async () => {
    renderInbox({ failTriage: true });
    await screen.findByRole("heading", { name: "First video" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark done" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to triage");
    expect(screen.getByRole("heading", { name: "First video" })).toBeInTheDocument();
  });

  it("does not triage when Enter is used inside an editor", async () => {
    const fetchMock = renderInbox();
    await screen.findByRole("heading", { name: "First video" });
    await userEvent.setup().type(screen.getByRole("textbox", { name: "Add tag" }), "Travel{Enter}");
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/inbox/triage")).toBe(false);
  });

  it("loads the next queue page", async () => {
    const fetchMock = renderInbox({ hasMore: true });
    await screen.findByRole("heading", { name: "First video" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Next queue page" }));
    await screen.findByRole("heading", { name: "Third video" });
    expect(fetchMock).toHaveBeenCalledWith("/api/inbox?page=2");
  });

  it("does not mark all done when confirmation is cancelled", async () => {
    const fetchMock = renderInbox();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await screen.findByRole("heading", { name: "First video" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Mark all done" }));
    expect(confirm).toHaveBeenCalled();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url === "/api/inbox/triage-all")).toBe(false));
  });

  it("opens the StashDB lookup dialog from Sync details", async () => {
    renderInbox({ stashDb: true });
    await screen.findByRole("heading", { name: "First video" });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Sync details" }));
    expect(await screen.findByText("StashDB lookup")).toBeInTheDocument();
    // The match list from the search, not an automatic apply.
    expect(await screen.findByText(/Ann, Newbie/)).toBeInTheDocument();
  });

  it("hides Sync details until StashDB is configured", async () => {
    renderInbox();
    await screen.findByRole("heading", { name: "First video" });
    expect(screen.queryByRole("button", { name: "Sync details" })).not.toBeInTheDocument();
  });

  it("shows the description of the selected item", async () => {
    renderInbox();
    expect(await screen.findByText("A short synopsis.")).toBeInTheDocument();
  });

  it("lists every StashDB performer, marking the ones the video already has", async () => {
    renderInbox({ stashDb: true });
    await screen.findByRole("heading", { name: "First video" });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sync details" }));
    await user.click(await screen.findByText(/Ann, Newbie/));
    expect(await screen.findByText("Newbie")).toBeInTheDocument();
    expect(screen.getByLabelText("Ann is already on this video")).toBeDisabled();
  });

  it("opens a form for the missing details when there is no studio to name the file by", async () => {
    const fetchMock = renderInbox();
    await screen.findByRole("heading", { name: "First video" });
    const user = userEvent.setup();
    expect(screen.getByRole("tooltip")).toHaveTextContent("Missing a studio");

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(screen.getByRole("button", { name: "Copy filename" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Enter a studio and a title to see it.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save & copy" })).toBeDisabled();

    await user.type(within(dialog).getByRole("combobox", { name: "Studio" }), "X-Art");
    const name = "[X-Art] - 10.10.2026 - First video.mp4";
    expect(within(dialog).getByText(name)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Save & copy" }));
    expect(writeText).toHaveBeenCalledWith(name);
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([url, init]) => url === "/api/media-items/1" && init?.method === "PATCH");
      expect(JSON.parse(patch![1]!.body as string)).toEqual({ studio: "X-Art" });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows the suggested name on hover and copies it on click", async () => {
    renderInbox();
    await screen.findByRole("heading", { name: "First video" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Skip for now" }));
    await screen.findByRole("heading", { name: "Second video" });

    const name = "[X-Art] - 10.10.2026 - Second video.mp4";
    expect(screen.getByRole("tooltip")).toHaveTextContent(name);

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(screen.getByRole("button", { name: `Copy filename: ${name}` }));
    expect(writeText).toHaveBeenCalledWith(name);
    expect(await within(screen.getByRole("tooltip")).findByText("Copied")).toBeInTheDocument();
  });

  it("saves the release date from StashDB onto the item", async () => {
    const fetchMock = renderInbox({ stashDb: true });
    await screen.findByRole("heading", { name: "First video" });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Sync details" }));
    await user.click(await screen.findByText(/Ann, Newbie/));
    expect(await screen.findByText("Release date")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(([url, init]) => url === "/api/media-items/1" && init?.method === "PATCH");
      expect(JSON.parse(patch![1]!.body as string)).toMatchObject({ releaseDate: "2018-12-25" });
    });
  });

  it("opens at the video the URL names", async () => {
    router.set({ item: 2 });
    renderInbox();
    expect(await screen.findByRole("heading", { name: "Second video" })).toBeInTheDocument();
  });

  it("finds a named video on a later page", async () => {
    router.set({ item: 3 });
    renderInbox({ hasMore: true });
    expect(await screen.findByRole("heading", { name: "Third video" })).toBeInTheDocument();
    expect(router.get().item).toBe(3);
  });

  it("keeps the URL on the video being reviewed", async () => {
    renderInbox();
    await screen.findByRole("heading", { name: "First video" });
    await waitFor(() => expect(router.get().item).toBe(1));
    await userEvent.setup().click(screen.getByRole("button", { name: "Skip for now" }));
    expect(router.get().item).toBe(2);
  });
});
