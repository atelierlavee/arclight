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
  /** The page draws its own heading; the shell skips the block above the content. */
  ownHeading: boolean;
};

export type ShellStore = {
  setHeader: React.Dispatch<React.SetStateAction<PageHeader | null>>;
  /** Where a page's header actions are portalled to. */
  actionsSlot: HTMLElement | null;
  /** Room in the slim bar between the logo and the links, for a page's own content. */
  startSlot: HTMLElement | null;
};

export const ShellContext = createContext<ShellStore | null>(null);

/**
 * Puts a page's own content in the shared header, between its logo and
 * its links — on an `xl` screen in the slim bar only (a phone's header
 * already has the menu and title; the tall masthead has no room). The watch
 * page uses it for its now-playing controls once the video scrolls away.
 */
export function HeaderStart({ children }: { children: React.ReactNode }) {
  const shell = useContext(ShellContext);
  return shell?.startSlot ? createPortal(children, shell.startSlot) : null;
}

