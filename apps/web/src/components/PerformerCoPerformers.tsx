// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useNavigate } from "@tanstack/react-router";
import { PerformerCard } from "./PerformerCard";
import type { CoPerformer } from "@/lib/performerApi";

/**
 * Everyone credited on a video this performer is also on.
 *
 * Uses the same poster tile as the Performers page rather than a third
 * portrait style — the app already has circles in the video modal and posters
 * for browsing, and a co-performer is something you browse to.
 *
 * Renders nothing at all when there are none: an empty "Appears with" heading
 * is worse than no heading, and most performers have none until files are
 * renamed to the convention that names a full cast.
 */
export function PerformerCoPerformers({
  performers,
  title = "Appears with",
}: {
  performers: CoPerformer[];
  /** A studio page says "Featuring" — same tiles, different relationship. */
  title?: string;
}) {
  const navigate = useNavigate();
  if (performers.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ul className="scrollbar-hide -mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
        {performers.map((person) => (
          <li key={person.id} className="shrink-0">
            <PerformerCard
              performer={person}
              onClick={() =>
                void navigate({
                  to: "/performer/$performerId",
                  params: { performerId: String(person.id) },
                })
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
