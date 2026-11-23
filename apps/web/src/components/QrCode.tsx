// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { encode } from "uqr";

/**
 * A QR code, drawn as SVG from the module grid.
 *
 * Built as React elements rather than injecting the library's SVG string, so
 * nothing is ever set as raw HTML. One <path> for all the dark modules keeps
 * it to a single element however large the code is.
 *
 * Always dark on white, whatever the app's theme: phone cameras read inverted
 * codes unreliably, and the white margin (four modules, as the spec asks) is
 * what lets a scanner find the edges against a dark page.
 */
export function QrCode({ value, size = 160, label }: { value: string; size?: number; label: string }) {
  const { path, extent } = useMemo(() => {
    const { data } = encode(value, { ecc: "M", border: 4 });
    const commands: string[] = [];
    data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) commands.push(`M${x} ${y}h1v1h-1z`);
      }),
    );
    return { path: commands.join(""), extent: data.length };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${extent} ${extent}`}
      shapeRendering="crispEdges"
      // Never squeezed by a flex row beside it: a code drawn smaller than
      // asked is harder for a camera to lock on to.
      className="shrink-0 rounded-md"
    >
      <rect width={extent} height={extent} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
