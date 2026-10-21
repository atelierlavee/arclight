import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider, useAppearance } from "./appearance";

// A holder rather than a reassigned variable: the probe writes into it from
// an effect, so the test can drive the store without rendering anything.
const handle: { current: ReturnType<typeof useAppearance> | null } = { current: null };
function Probe() {
  const store = useAppearance();
  useEffect(() => {
    handle.current = store;
  });
  return null;
}

function stored() {
  return JSON.parse(localStorage.getItem("appearance") ?? "{}") as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  handle.current = null;
});

describe("appearance across tabs", () => {
  it("adopts another tab's discreet mode, and a later change here doesn't undo it", async () => {
    // The server copy has discreet off, the way a stale save would leave it.
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response("{}")
        : new Response(JSON.stringify({ appearance: { discreet: false } })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    await act(async () => {});

    // Another tab arms discreet mode.
    const next = JSON.stringify({ ...stored(), discreet: true });
    localStorage.setItem("appearance", next);
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "appearance",
          newValue: next,
          storageArea: localStorage,
        }),
      );
    });
    expect(handle.current?.discreet).toBe(true);
    expect(document.documentElement.getAttribute("data-discreet")).toBe("true");

    // A change to something else here writes only that key.
    act(() => handle.current?.set({ hoverZoom: false }));
    expect(stored().discreet).toBe(true);
    expect(stored().hoverZoom).toBe(false);
  });

  it("keeps discreet on when the server's copy says off", async () => {
    localStorage.setItem("appearance", JSON.stringify({ discreet: true }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ appearance: { discreet: false } }))),
    );
    render(
      <AppearanceProvider>
        <Probe />
      </AppearanceProvider>,
    );
    await act(async () => {});
    expect(handle.current?.discreet).toBe(true);
  });
});
