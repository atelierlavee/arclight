import { ShieldCheck } from "lucide-react";
import { AppShell } from "./AppShell";

/**
 * What a non-owner profile sees on a page that manages the library — the
 * inbox, the missing-files manager — instead of controls the server would
 * refuse anyway.
 */
export function OwnerOnlyPage({ title }: { title: string }) {
  return (
    <AppShell title={title}>
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3 px-4 py-20 text-center">
        <ShieldCheck className="size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold">Only the owner profile can manage this</h2>
        <p className="text-sm text-muted-foreground">
          Switch to the owner profile from the account menu to use this page.
        </p>
      </div>
    </AppShell>
  );
}
