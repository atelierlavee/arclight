// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { createContext, useContext } from "react";
import { Check } from "lucide-react";
import { settingsAnchor } from "@/lib/settingsAnchor";
import { cn } from "@/lib/utils";

export const settingsInputClass =
  "w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none transition-colors focus:border-ring/60 focus:bg-secondary";

/** The card every settings block sits in, for the few that draw their own. */
export const settingsCardClass =
  "w-full scroll-mt-24 overflow-hidden rounded-xl border border-border bg-card/40";

/** Set inside a SettingsGroup, where sections share one card, and how they lay out there. */
const InGroup = createContext<false | "rows" | "stacked">(false);

/**
 * Several sections in one card, ruled off from each other. Each keeps its
 * own heading and anchor, so search and links still land on the right one.
 */
export function SettingsGroup({
  layout = "rows",
  children,
}: {
  /** "rows": heading beside the controls. "stacked": heading above, for charts that want the full width. */
  layout?: "rows" | "stacked";
  children: React.ReactNode;
}) {
  return (
    <div className={cn(settingsCardClass, "divide-y divide-border/70")}>
      <InGroup.Provider value={layout}>{children}</InGroup.Provider>
    </div>
  );
}

/**
 * A titled block. Shared so account and site settings look identical: the
 * title and what it's for in a header strip, ruled off from the controls, so
 * a page of several reads as a list of headings first.
 */
export function SettingsSection({
  title,
  description,
  action,
  headingId,
  className,
  children,
}: {
  title: string;
  description?: string;
  /** Sits at the right of the header: a figure, or an action on the whole block. */
  action?: React.ReactNode;
  /** For a block that older links and search already reach by its heading. */
  headingId?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const grouped = useContext(InGroup);
  if (grouped) {
    return (
      // Inside a shared card each part reads as a row: what it is on the
      // left, the controls on the right, so long explanations don't push the
      // fields down and the parts line up with each other.
      <section
        id={settingsAnchor(title)}
        aria-labelledby={headingId}
        className={cn(
          "grid scroll-mt-24 gap-x-8 gap-y-4 p-5 md:p-6",
          grouped === "rows" && "md:grid-cols-[13rem_minmax(0,1fr)]",
          className,
        )}
      >
        <header className="space-y-1">
          <h3 id={headingId} className="scroll-mt-24 text-[15px] font-semibold tracking-tight">
            {title}
          </h3>
          {description && <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
          {action && <div className="pt-2">{action}</div>}
        </header>
        <div className="min-w-0 space-y-4">{children}</div>
      </section>
    );
  }
  return (
    <section
      id={settingsAnchor(title)}
      aria-labelledby={headingId}
      className={cn(settingsCardClass, className)}
    >
      <header className="flex items-start justify-between gap-4 border-b border-border/70 bg-card/30 px-5 py-4">
        <div className="min-w-0 space-y-0.5">
          <h2 id={headingId} className="scroll-mt-24 text-[15px] font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

export function SettingsFeedback({ error, saved }: { error: string | null; saved: boolean }) {
  if (error) {
    return (
      <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">{error}</p>
    );
  }
  if (saved) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Check className="size-3.5" />
        Saved
      </p>
    );
  }
  return null;
}
