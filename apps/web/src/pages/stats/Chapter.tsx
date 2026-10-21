import type React from "react";
import { useAppearance } from "@/lib/appearance";
import { cn } from "@/lib/utils";

/** A numbered chapter: a hairline rule, a small kicker, a big title. */
export function Chapter({
  id,
  number,
  title,
  kicker,
  children,
}: {
  id?: string;
  number: string;
  title: string;
  kicker: string;
  children: React.ReactNode;
}) {
  const { motion } = useAppearance();
  return (
    <section
      id={id}
      className={cn("scroll-mt-20 border-t border-border pt-8 mt-16 first:mt-12", motion === "full" && "animate-fade-up")}
    >
      <div className="mb-8 flex items-baseline gap-5">
        <span className="font-mono text-sm tabular-nums text-muted-foreground">{number}</span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">{kicker}</p>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}
