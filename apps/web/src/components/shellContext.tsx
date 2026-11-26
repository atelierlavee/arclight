// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

// The shell's shared state, in a module of its own so that what the header
// hosts (the watch page's now-playing controls, which live beside the
// player) can reach it without importing the shell — which imports the
// player — and closing a loop.

/** What the current page has told the persistent frame about itself. */
export type PageHeader = {
  /** Which AppShell set this, so an outgoing page can't clear its successor's. */
  owner: string;
  title?: string;
  subtitle?: string;
  centeredHeader: boolean;
  /** The page's PageScope, for the appearance menu that lives up here. */
  scope: string | null;
};

export type ShellStore = {
  setHeader: React.Dispatch<React.SetStateAction<PageHeader | null>>;
  /** Where a page's header actions are portalled to. */
  actionsSlot: HTMLElement | null;
  /** The header's middle on a wide screen, for a page's own content. */
  startSlot: HTMLElement | null;
};

export const ShellContext = createContext<ShellStore | null>(null);

/**
 * Puts a page's own content in the middle of the shared header, on a wide
 * screen (a phone's header already has the menu and title). The watch
 * page uses it for its now-playing controls once the video scrolls away.
 */
export function HeaderStart({ children }: { children: React.ReactNode }) {
  const shell = useContext(ShellContext);
  return shell?.startSlot ? createPortal(children, shell.startSlot) : null;
}

