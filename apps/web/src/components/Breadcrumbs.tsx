import { ChevronRight, Library } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type Breadcrumb = {
  label: string;
  to?: "/" | "/browse" | "/performers" | "/studios" | "/albums" | "/series";
  search?: Record<string, string | number | undefined>;
  /** Animate the navigation as a view transition (the album stack folding). */
  viewTransition?: boolean;
};

export function Breadcrumbs({
  items,
  overlay = false,
}: {
  items: Breadcrumb[];
  overlay?: boolean;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-1 text-sm",
        overlay
          ? "pointer-events-auto text-white/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]"
          : "text-muted-foreground",
      )}
    >
      <Link
        to="/browse"
        search={{}}
        className={cn(
          "flex shrink-0 items-center gap-1",
          overlay ? "hover:text-white" : "hover:text-foreground",
        )}
      >
        <Library className="size-3.5" />
        Library
      </Link>
      {items.map((item, index) => (
        <span
          key={`${item.label}-${index}`}
          className="flex min-w-0 items-center gap-1"
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0",
              overlay ? "text-white/60" : "text-muted-foreground/50",
            )}
          />
          {item.to ? (
            <Link
              to={item.to}
              search={item.search}
              viewTransition={item.viewTransition}
              className={cn(
                "max-w-48 truncate",
                overlay ? "hover:text-white" : "hover:text-foreground",
                index === items.length - 1 &&
                  (overlay ? "text-white" : "text-foreground"),
              )}
            >
              {item.label}
            </Link>
          ) : (
            <span
              className={cn(
                "max-w-48 truncate",
                overlay ? "text-white" : "text-foreground",
              )}
            >
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
