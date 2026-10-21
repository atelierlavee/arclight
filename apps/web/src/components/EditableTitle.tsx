import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateItem } from "@/lib/mediaItemApi";
import { invalidateItem } from "@/lib/invalidate";

export function EditableTitle({
  itemId,
  title,
  className,
}: {
  itemId: number;
  title: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const queryClient = useQueryClient();

  useEffect(() => setValue(title), [title]);

  const mutation = useMutation({
    mutationFn: (newTitle: string) => updateItem(itemId, { title: newTitle }),
    onSuccess: () => {
      invalidateItem(queryClient, itemId);
      setEditing(false);
    },
  });

  function save() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== title) {
      mutation.mutate(trimmed);
    } else {
      setEditing(false);
      setValue(title);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            // Cancel just the edit — stopPropagation so an ancestor's
            // Escape-to-close/back handler doesn't also fire from this keypress.
            e.stopPropagation();
            setValue(title);
            setEditing(false);
          }
        }}
        className={className ?? "border-b border-border bg-transparent text-lg font-semibold text-foreground outline-none"}
      />
    );
  }

  return (
    <h2
      onClick={() => setEditing(true)}
      className={className ?? "cursor-text text-lg font-semibold hover:underline"}
      title="Click to rename"
    >
      {title}
    </h2>
  );
}
