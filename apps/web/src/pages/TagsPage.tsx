import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil, Tag } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EditDialog, SaveButton } from "@/components/EditDialog";
import { EDIT_INPUT } from "@/lib/editForm";
import { descendantIds, fetchTags, saveTag, type TagRow } from "@/lib/tagApi";
import { qk } from "@/lib/queryKeys";
import { useIsOwner } from "@/lib/profile";

/**
 * Every tag, drawn as its families: top-level tags, with the tags under each
 * indented beneath it. A tag with two parents appears under both, since
 * filtering by either one finds it.
 *
 * Clicking a tag browses it — which includes everything under it, so the
 * tree is also a map of what each click will show.
 */
export function TagsPage() {
  const { data, isLoading } = useQuery({ queryKey: qk.tags, queryFn: fetchTags });
  const [editing, setEditing] = useState<TagRow | null>(null);
  const tags = data?.tags ?? [];
  const ids = new Set(tags.map((tag) => tag.id));
  // A parent that no longer exists does not make a tag disappear.
  const roots = tags.filter((tag) => !tag.parentIds.some((id) => ids.has(id)));

  return (
    <AppShell
      title="Tags"
      subtitle={tags.length > 0 ? `${tags.length} ${tags.length === 1 ? "tag" : "tags"}` : undefined}
    >
      <div className="max-w-3xl px-4 py-6 md:px-6">
        {!isLoading && tags.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No tags yet. Add them to a video from its details.
          </p>
        )}
        <ul className="space-y-0.5">
          {roots.map((tag) => (
            <TagNode key={tag.id} tag={tag} all={tags} depth={0} path={new Set()} onEdit={setEditing} />
          ))}
        </ul>
      </div>
      {editing && <TagEditDialog tag={editing} all={tags} onClose={() => setEditing(null)} />}
    </AppShell>
  );
}

function TagNode({
  tag,
  all,
  depth,
  path,
  onEdit,
}: {
  tag: TagRow;
  all: TagRow[];
  depth: number;
  /** Tags already above this one, so a loop a restore brought back cannot recurse. */
  path: Set<number>;
  onEdit: (tag: TagRow) => void;
}) {
  const isOwner = useIsOwner();
  const children = all.filter((child) => child.parentIds.includes(tag.id) && !path.has(child.id));
  const below = new Set(path).add(tag.id);

  return (
    <li>
      <div className="group flex items-center gap-2 rounded-md py-1 pr-2" style={{ paddingLeft: depth * 20 }}>
        <Tag className="size-3.5 shrink-0 text-muted-foreground" style={tag.color ? { color: tag.color } : undefined} />
        <Link to="/browse" search={{ tag: tag.name }} className="truncate text-sm hover:underline">
          {tag.name}
        </Link>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{tag.itemCount}</span>
        {isOwner && (
          <button
            type="button"
            onClick={() => onEdit(tag)}
            aria-label={`Edit ${tag.name}`}
            className="ml-auto rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </div>
      {tag.description && (
        <p className="pb-1 text-xs text-muted-foreground" style={{ paddingLeft: depth * 20 + 22 }}>
          {tag.description}
        </p>
      )}
      {children.length > 0 && (
        <ul className="space-y-0.5">
          {children.map((child) => (
            <TagNode key={child.id} tag={child} all={all} depth={depth + 1} path={below} onEdit={onEdit} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TagEditDialog({ tag, all, onClose }: { tag: TagRow; all: TagRow[]; onClose: () => void }) {
  const [description, setDescription] = useState(tag.description ?? "");
  const [parentIds, setParentIds] = useState(new Set(tag.parentIds));
  const [filter, setFilter] = useState("");
  const queryClient = useQueryClient();

  // Itself and anything under it would make a loop; the server refuses
  // those too, but they should not be offered.
  const below = descendantIds(all, tag.id);
  const candidates = all.filter(
    (other) =>
      other.id !== tag.id &&
      !below.has(other.id) &&
      other.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  const save = useMutation({
    mutationFn: () =>
      saveTag(tag.id, {
        description: description.trim() || null,
        parentIds: [...parentIds],
      }),
    onSuccess: () => {
      // The sidebar, the filter bar and every browse filtered by a tag.
      queryClient.invalidateQueries({ queryKey: qk.tags });
      queryClient.invalidateQueries({ queryKey: qk.mediaItems.all });
      onClose();
    },
  });

  const toggle = (id: number) =>
    setParentIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <EditDialog title={`Edit ${tag.name}`} onClose={onClose}>
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={`${EDIT_INPUT} resize-y`}
        />
      </label>

      <div className="space-y-1">
        <span className="text-xs text-muted-foreground">
          Sits under {parentIds.size > 0 ? `(${parentIds.size})` : ""}
        </span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a tag…"
          className={EDIT_INPUT}
        />
        <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-border p-1.5">
          {candidates.length === 0 && (
            <p className="px-1 py-0.5 text-xs text-muted-foreground">No tags to choose.</p>
          )}
          {candidates.map((other) => (
            <label key={other.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent">
              <input type="checkbox" checked={parentIds.has(other.id)} onChange={() => toggle(other.id)} />
              <span className="truncate">{other.name}</span>
            </label>
          ))}
        </div>
        <span className="block text-[11px] text-muted-foreground/70">
          Browsing a tag chosen here will include {tag.name} and everything under it.
        </span>
      </div>

      {save.error && <p className="text-xs text-destructive">{save.error.message}</p>}
      <SaveButton onClick={() => save.mutate()} disabled={save.isPending} />
    </EditDialog>
  );
}
