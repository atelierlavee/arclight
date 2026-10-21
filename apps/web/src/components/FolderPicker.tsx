import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFolders, moveToFolder } from "@/lib/mediaItemApi";
import { qk } from "@/lib/queryKeys";
import { invalidateItem } from "@/lib/invalidate";

export function FolderPicker({ itemId, parentId }: { itemId: number; parentId: number | null }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: qk.folders, queryFn: fetchFolders });

  const mutation = useMutation({
    mutationFn: (newParentId: number | null) => moveToFolder(itemId, newParentId),
    onSuccess: () => {
      invalidateItem(queryClient, itemId);
    },
  });

  if (!data || data.folders.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      Folder:
      <select
        value={parentId ?? ""}
        onChange={(e) => mutation.mutate(e.target.value ? Number(e.target.value) : null)}
        className="rounded border border-border bg-transparent px-1 py-0.5 text-foreground"
      >
        <option value="">(none)</option>
        {data.folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.title}
          </option>
        ))}
      </select>
    </div>
  );
}
