import { useAppearance } from "@/lib/appearance";
import { cn } from "@/lib/utils";

/**
 * The library's biggest tags as a ticker under the feature, drifting
 * sideways, sized by how much is under each. Purely decorative: no links,
 * no counts. With less motion asked for, it stays put.
 */
export function ExploreTags({ tags }: { tags: { id: number; name: string; itemCount?: number }[] }) {
  const { motion } = useAppearance();
  const moving = motion === "full";
  const top = [...tags]
    .filter((tag) => (tag.itemCount ?? 0) > 0)
    .sort((a, b) => (b.itemCount ?? 0) - (a.itemCount ?? 0))
    .slice(0, 24);
  if (top.length < 4) return null;
  const max = top[0].itemCount ?? 1;
  // Big and small interleaved, so the strip doesn't run largest to smallest.
  const ordered = [...top].sort((a, b) => a.name.localeCompare(b.name));

  const list = (copy: number) =>
    ordered.map((tag) => {
      const weight = (tag.itemCount ?? 0) / max;
      return (
        <li key={`${copy}:${tag.id}`} className="shrink-0 pr-7" aria-hidden={copy > 0 || undefined}>
          <span
            className="sensitive whitespace-nowrap font-bold tracking-tight text-muted-foreground"
            style={{ fontSize: `${0.95 + weight * 1.1}rem`, opacity: 0.55 + weight * 0.45 }}
          >
            {tag.name}
          </span>
        </li>
      );
    });

  return (
    // A slim band under the feature — decoration, not navigation: the
    // library's words drifting past, nothing to read twice or click.
    <section aria-hidden className="flex items-center py-1">
      {/* Faded at both edges so tags slide in and out rather than being cut. */}
      <div
        className={cn(
          "min-w-0 flex-1 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)]",
          moving ? "overflow-hidden" : "scrollbar-hide overflow-x-auto",
        )}
      >
        <ul
          className={cn("flex w-max items-baseline py-2", moving && "animate-marquee")}
          // Longer strips take longer, so the speed stays the same.
          style={{ "--marquee-duration": `${ordered.length * 3}s` } as React.CSSProperties}
        >
          {list(0)}
          {moving && list(1)}
        </ul>
      </div>
    </section>
  );
}
