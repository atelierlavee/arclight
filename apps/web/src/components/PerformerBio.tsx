import { useEffect, useRef, useState } from "react";
import { ClampedText } from "./ClampedText";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { savePerformerBio } from "@/lib/performerApi";
import { qk } from "@/lib/queryKeys";

/**
 * Click-to-edit free text on a performer's profile.
 *
 * Click-to-edit rather than a permanent textarea, which is how the media
 * modal does it: that lives inside an explicit edit mode, while a profile
 * page should read as prose. Six mostly-empty profiles each showing a bare
 * input box reads as an unfinished form rather than a page.
 *
 * Saves on blur, and only when the text actually changed — opening the editor
 * and clicking away must not write anything.
 */
export function PerformerBio({ performerId, bio }: { performerId: number; bio: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(bio ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  // Resync when the query refetches, or when the profile switches performer.
  useEffect(() => setValue(bio ?? ""), [bio]);
  useEffect(() => setEditing(false), [performerId]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const save = useMutation({
    mutationFn: (next: string) => savePerformerBio(performerId, next),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.performer.detail(performerId) }),
  });

  function commit() {
    setEditing(false);
    if (value.trim() !== (bio ?? "").trim()) save.mutate(value);
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Escape abandons the edit; Enter is left alone, since a bio is
          // prose and wants line breaks.
          if (e.key === "Escape") {
            setValue(bio ?? "");
            setEditing(false);
          }
        }}
        rows={4}
        placeholder="Write a short bio…"
        className="w-full max-w-2xl resize-y rounded-md border border-border bg-secondary/40 p-3 text-sm leading-relaxed outline-none focus:border-ring/60"
      />
    );
  }

  if (!bio) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Pencil className="size-3.5" />
        Add a bio
      </button>
    );
  }

  // The prose is clickable to edit and the clamp brings a button of its own,
  // so the two sit side by side rather than nested — a button inside a button
  // is invalid, and browsers drop the inner one, which would be the Read more.
  return (
    <div className="group max-w-2xl">
      <ClampedText
        text={bio}
        className="text-sm leading-relaxed text-muted-foreground transition-colors group-hover:text-foreground/90"
      />
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Click to edit"
        className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
      >
        <Pencil className="size-3" />
        Edit
      </button>
    </div>
  );
}
