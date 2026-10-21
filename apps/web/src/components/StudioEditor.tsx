import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { updateItem } from "@/lib/mediaItemApi";
import { fetchStudios } from "@/lib/studioApi";
import { qk } from "@/lib/queryKeys";
import { invalidateItem } from "@/lib/invalidate";

/**
 * Studio for one item. Read-only until the modal is in edit mode, matching
 * how tags and performers behave.
 */
export function StudioEditor({
  itemId,
  studio,
  readOnly = false,
}: {
  itemId: number;
  studio: string | null;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(studio ?? "");
  const queryClient = useQueryClient();

  // The item carries a studio name, but the page is keyed by id — so a name
  // renamed on disk doesn't break links. Shares the ["studios"] key with the
  // sidebar and the studios page, so this is usually served from cache.
  const { data: studios } = useQuery({
    queryKey: qk.studios.all,
    queryFn: fetchStudios,
    enabled: readOnly && studio !== null,
  });

  useEffect(() => setValue(studio ?? ""), [studio]);

  const mutation = useMutation({
    mutationFn: (next: string) => updateItem(itemId, { studio: next || null }),
    onSuccess: () => {
      invalidateItem(queryClient, itemId);
      queryClient.invalidateQueries({ queryKey: qk.studios.all });
    },
  });

  if (readOnly) {
    if (!studio) return <span className="text-xs text-muted-foreground/60">—</span>;

    const match = studios?.studios.find(
      (row) => row.name.toLowerCase() === studio.toLowerCase()
    );
    // Plain text until the id is known — a studio only just typed in won't be
    // in the list yet, and a dead link is worse than an unlinked name.
    return match ? (
      <Link
        to="/studio/$studioId"
        params={{ studioId: String(match.id) }}
        className="text-sm text-foreground/90 hover:underline"
      >
        {studio}
      </Link>
    ) : (
      <span className="text-sm text-foreground/90">{studio}</span>
    );
  }

  function save() {
    // Saving hands the field over permanently, so don't do it for a no-op.
    if (value.trim() === (studio ?? "")) return;
    mutation.mutate(value.trim());
  }

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      placeholder="Add studio…"
      className="w-full border-b border-border bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
    />
  );
}
