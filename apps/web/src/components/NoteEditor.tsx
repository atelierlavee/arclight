// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from "react";
import { Lock, NotebookPen } from "lucide-react";
import { useToast } from "@/lib/toast";

/** Matches the server's NOTE_MAX_LENGTH. */
const MAX_LENGTH = 10_000;

/**
 * A private note: one profile's own words about a video or a performer.
 *
 * Collapsed to a single "Add a note" button until there is one, because most
 * things never get a note and an empty box on every page is noise. Saves when
 * the box loses focus, like the description editor; there is no Save button
 * to forget.
 */
export function NoteEditor({
  note,
  onSave,
  placeholder = "Write something only you will see…",
}: {
  note: string | null;
  onSave: (note: string | null) => Promise<void>;
  placeholder?: string;
}) {
  const [value, setValue] = useState(note ?? "");
  const [open, setOpen] = useState(Boolean(note));
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // A different item (or a save elsewhere) brings a different note.
  useEffect(() => {
    setValue(note ?? "");
    setOpen(Boolean(note));
  }, [note]);

  async function save() {
    const next = value.trim();
    if (next === (note ?? "")) {
      if (!next) setOpen(false);
      return;
    }
    setStatus("saving");
    try {
      await onSave(next || null);
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1500);
      if (!next) setOpen(false);
    } catch (error) {
      setStatus("idle");
      toast({
        title: "Couldn’t save the note",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          // After the textarea has mounted.
          window.setTimeout(() => textareaRef.current?.focus(), 0);
        }}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <NotebookPen className="size-3.5" />
        Add a private note
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <textarea
        ref={textareaRef}
        value={value}
        maxLength={MAX_LENGTH}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void save()}
        placeholder={placeholder}
        rows={3}
        aria-label="Private note"
        className="sensitive w-full resize-y rounded border border-border bg-transparent p-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring/60"
      />
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Lock className="size-3" />
        Only this profile can see it.
        {status === "saving" && <span className="ml-auto">Saving…</span>}
        {status === "saved" && <span className="ml-auto">Saved</span>}
      </p>
    </div>
  );
}
