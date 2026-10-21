import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Loader2,
  Move,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  createCategory,
  deleteCategory,
  fetchCategories,
  moveCategory,
  renameCategory,
  resetCategoryCover,
  uploadCategoryCover,
  type Category,
} from "@/lib/categoryApi";
import { CategoryCoverEditor } from "./CategoryCoverEditor";
import { SettingsSection } from "./SettingsSection";
import { qk } from "@/lib/queryKeys";

function CategoryRow({
  category,
  index,
  count,
  onError,
}: {
  category: Category;
  index: number;
  count: number;
  onError: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState(category.label);
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk.categories });
    queryClient.invalidateQueries({ queryKey: qk.mediaItems.all });
  };

  const rename = useMutation({
    mutationFn: () => renameCategory(category.id, label.trim()),
    onSuccess: () => {
      onError(null);
      invalidate();
    },
    onError: (err: Error) => onError(err.message),
  });
  const move = useMutation({
    mutationFn: (position: number) => moveCategory(category.id, position),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => deleteCategory(category.id),
    onSuccess: (result) => {
      onError(
        result.movedCount > 0
          ? `Moved ${result.movedCount} item${result.movedCount === 1 ? "" : "s"} to ${result.movedTo}.`
          : null
      );
      invalidate();
    },
    onError: (err: Error) => onError(err.message),
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadCategoryCover(category.slug, file),
    onSuccess: () => {
      onError(null);
      invalidate();
      // Straight into framing: a cover you just chose is when you know how it
      // should be cropped.
      setRepositioning(true);
    },
    onError: (err: Error) => onError(err.message),
  });
  const resetCover = useMutation({
    mutationFn: () => resetCategoryCover(category.slug),
    onSuccess: invalidate,
  });

  const preview =
    category.cover ??
    (category.representativeItemId != null
      ? `/api/media-items/${category.representativeItemId}/thumbnail`
      : null);
  const busy = upload.isPending || resetCover.isPending || remove.isPending;
  const [repositioning, setRepositioning] = useState(false);

  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="flex items-center gap-2 sm:gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          e.target.value = "";
        }}
      />

      <div className="flex shrink-0 flex-col">
        <button
          type="button"
          onClick={() => move.mutate(category.position - 1)}
          disabled={index === 0}
          aria-label={`Move ${category.label} up`}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => move.mutate(category.position + 1)}
          disabled={index === count - 1}
          aria-label={`Move ${category.label} down`}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-25"
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>

      <div className="h-9 w-14 shrink-0 overflow-hidden rounded bg-secondary ring-1 ring-border sm:h-10 sm:w-20">
        {preview && (
          <img
            src={preview}
            alt=""
            style={{
              objectPosition: `${category.coverPositionX}% ${category.coverPositionY}%`,
              transform: `scale(${category.coverScale / 100})`,
              transformOrigin: `${category.coverPositionX}% ${category.coverPositionY}%`,
            }}
            className="h-full w-full object-cover"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label.trim() !== category.label && rename.mutate()}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-full border-b border-transparent bg-transparent text-sm font-medium outline-none hover:border-border focus:border-border"
        />
        <p className="truncate text-[11px] text-muted-foreground">
          {category.total} {category.total === 1 ? "item" : "items"}
          {/* Dropped on a narrow row rather than left to truncate: "auto c…"
              reads as text that failed, where no text reads as a count. */}
          <span className="hidden sm:inline">
            {" · "}
            {category.cover ? "your cover" : "auto cover"}
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Set a cover image"
        aria-label={`Set cover for ${category.label}`}
        className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
      >
        {upload.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ImagePlus className="size-3.5" />
        )}
      </button>

      {preview && (
        <button
          type="button"
          onClick={() => setRepositioning((v) => !v)}
          disabled={busy}
          aria-pressed={repositioning}
          title="Drag the cover to choose which part shows"
          aria-label={`Reposition cover for ${category.label}`}
          className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <Move className="size-3.5" />
        </button>
      )}

      {category.cover && (
        <button
          type="button"
          onClick={() => resetCover.mutate()}
          disabled={busy}
          title="Use the newest item's artwork instead"
          aria-label={`Reset cover for ${category.label}`}
          className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={() => remove.mutate()}
        disabled={busy}
        title={
          category.total > 0
            ? `Its ${category.total} items move to the first remaining category`
            : "Remove this category"
        }
        aria-label={`Delete ${category.label}`}
        className="shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-3.5" />
      </button>
      </div>

      {repositioning && preview && (
        <CategoryCoverEditor
          category={category}
          src={preview}
          onDone={() => setRepositioning(false)}
        />
      )}
    </div>
  );
}

export function CategorySettings() {
  const [newLabel, setNewLabel] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({ queryKey: qk.categories, queryFn: fetchCategories });
  const categories = data?.categories ?? [];

  const add = useMutation({
    mutationFn: () => createCategory(newLabel.trim()),
    onSuccess: () => {
      setNewLabel("");
      setMessage(null);
      queryClient.invalidateQueries({ queryKey: qk.categories });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  return (
    <SettingsSection
      title="Categories"
      description="The tiles at the top of the home page. Rename, reorder, add your own, or set a cover image for each."
    >
      <div className="space-y-2">
        {categories.map((category, index) => (
          <CategoryRow
            key={category.id}
            category={category}
            index={index}
            count={categories.length}
            onError={setMessage}
          />
        ))}
      </div>

      {message && (
        <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">{message}</p>
      )}

      <div className="flex items-center gap-2">
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && newLabel.trim() && add.mutate()}
          placeholder="New category name…"
          className="flex-1 rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-sm outline-none focus:border-ring/60"
        />
        <button
          type="button"
          onClick={() => add.mutate()}
          disabled={!newLabel.trim() || add.isPending}
          className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
        >
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        Deleting a category never deletes videos — they move to the first remaining category.
      </p>
    </SettingsSection>
  );
}
