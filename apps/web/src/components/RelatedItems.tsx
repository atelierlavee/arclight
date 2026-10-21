import { useQuery } from "@tanstack/react-query";
import type { MediaCardItem } from "./MediaCard";
import { MediaRow } from "./MediaRow";
import { qk } from "@/lib/queryKeys";

async function fetchRelated(id: number): Promise<{ items: MediaCardItem[] }> {
  const res = await fetch(`/api/media-items/${id}/related`);
  if (!res.ok) throw new Error(`Failed to load related items: ${res.status}`);
  return res.json();
}

function noopOpenFolder() {}

export function RelatedItems({
  itemId,
  onSelect,
}: {
  itemId: number;
  onSelect: (id: number) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: qk.relatedItems.forItem(itemId),
    queryFn: () => fetchRelated(itemId),
  });

  // Folders have no meaningful "more like this" click target inside a modal,
  // so they're dropped rather than given a dead-end card.
  const items = (data?.items ?? []).filter((i) => i.itemType !== "folder");
  // Empty and still-loading look identical from here, so only the settled
  // empty case is allowed to remove the section.
  if (!isLoading && items.length === 0) return null;

  return (
    <div className="border-t border-border px-4 py-6 md:px-6">
      <MediaRow
        title="More Like This"
        items={items}
        loading={isLoading}
        onSelectItem={onSelect}
        onOpenFolder={noopOpenFolder}
      />
    </div>
  );
}
