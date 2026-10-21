import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveCategoryFraming, type Category } from "@/lib/categoryApi";
import { FramingEditor, type FramingValue } from "./FramingEditor";
import { qk } from "@/lib/queryKeys";

/**
 * Drag-to-reframe for a category tile's cover.
 *
 * The drag itself lives in FramingEditor, shared with the video thumbnail
 * editor. This wrapper only knows where the value comes from and where it
 * goes back to.
 *
 * The editor sits in settings rather than on the tiles themselves: those are
 * links, and a pointer handler on them would have to fight the navigation for
 * every press. Settings is also already where covers are uploaded and reset.
 */
export function CategoryCoverEditor({
  category,
  src,
  onDone,
}: {
  category: Category;
  src: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (next: FramingValue) =>
      saveCategoryFraming(category.id, {
        coverPositionX: next.x,
        coverPositionY: next.y,
        coverScale: next.scale,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.categories });
      onDone();
    },
  });

  return (
    <div className="mt-3">
      <FramingEditor
        src={src}
        value={{ x: category.coverPositionX, y: category.coverPositionY, scale: category.coverScale }}
        // Matches the home-page tile's ratio (w-96 by h-44) so this preview
        // and the real thing crop identically.
        aspectClass="aspect-[96/44]"
        saving={save.isPending}
        onSave={(next) => save.mutate(next)}
        onCancel={onDone}
      />
      {save.isError && (
        <p className="mt-1 text-xs text-destructive">Could not save that framing.</p>
      )}
    </div>
  );
}
