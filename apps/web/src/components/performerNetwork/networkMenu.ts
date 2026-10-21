import { Crosshair, ExternalLink, EyeOff, Pin, Play, Route } from "lucide-react";
import type { ContextMenuState } from "@/components/ContextMenu";
import type { NetworkNode } from "@/lib/performerApi";

/** Every action for one performer (or studio) in one place, for the right-click menu. */
export function nodeMenuEntries(
  node: NetworkNode,
  {
    focused,
    pinned,
    openProfile,
    playLatest,
    toggleFocus,
    hide,
    findConnection,
    unpin,
  }: {
    focused: boolean;
    pinned: boolean;
    openProfile: () => void;
    playLatest: () => void;
    toggleFocus: () => void;
    hide: () => void;
    findConnection: () => void;
    unpin: () => void;
  },
): ContextMenuState["entries"] {
  const studio = node.kind === "studio";
  return [
    { label: studio ? "Open studio" : "Open profile", icon: ExternalLink, onSelect: openProfile },
    { label: studio ? `Play ${node.name}` : "Play latest", icon: Play, onSelect: playLatest },
    { separator: true },
    {
      label: focused ? "Stop focusing" : "Focus",
      icon: Crosshair,
      onSelect: toggleFocus,
    },
    { label: "Hide", icon: EyeOff, onSelect: hide },
    ...(studio
      ? []
      : [
          {
            label: "Find a connection…",
            icon: Route,
            onSelect: findConnection,
          },
        ]),
    ...(pinned ? [{ label: "Let them float again", icon: Pin, onSelect: unpin }] : []),
  ];
}
