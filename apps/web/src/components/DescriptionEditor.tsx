import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateItem } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";

export function DescriptionEditor({
  itemId,
  description,
}: {
  itemId: number;
  description: string | null;
}) {
  const [value, setValue] = useState(description ?? "");
  const queryClient = useQueryClient();

  useEffect(() => setValue(description ?? ""), [description]);

  const mutation = useMutation({
    mutationFn: (newDescription: string) =>
      updateItem(itemId, { description: newDescription || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.mediaItem.detail(itemId) });
    },
  });

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value !== (description ?? "")) mutation.mutate(value);
      }}
      placeholder="Add a description…"
      rows={3}
      className="w-full resize-none rounded border border-border bg-transparent p-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
    />
  );
}
