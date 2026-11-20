import { Check } from "lucide-react";
import { settingsAnchor } from "@/lib/settingsAnchor";

export const settingsInputClass =
  "w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none transition-colors focus:border-ring/60 focus:bg-secondary";

/** A titled block. Shared so account and site settings look identical. */
export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={settingsAnchor(title)}
      className="w-full scroll-mt-24 space-y-4 rounded-lg border border-border bg-card/40 p-5"
    >
      <div className="space-y-1">
        <h2 className="font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
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
