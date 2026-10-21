import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, RotateCcw } from "lucide-react";
import { resetThumbnail, uploadThumbnail } from "@/lib/mediaItemApi";
import { invalidateItemEverywhere } from "@/lib/invalidate";

/**
 * Replace or revert an item's thumbnail.
 *
 * Reverting deletes the upload rather than hiding it — the generated poster
 * is always reproducible from the video, so there's nothing worth keeping.
 */
export function ThumbnailPicker({
  itemId,
  hasCustom,
  onUploaded,
}: {
  itemId: number;
  hasCustom: boolean;
  /** Fired after a successful upload, so the caller can open framing. */
  onUploaded?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  function invalidate() {
    // Every surface that draws this thumbnail, not just the modal.
    invalidateItemEverywhere(queryClient, itemId);
  }

  const upload = useMutation({
    mutationFn: (file: File) => uploadThumbnail(itemId, file),
    onSuccess: () => {
      setError(null);
      invalidate();
      onUploaded?.();
    },
    onError: (err: Error) => setError(err.message),
  });

  const revert = useMutation({ mutationFn: () => resetThumbnail(itemId), onSuccess: invalidate });
  const busy = upload.isPending || revert.isPending;

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.mutate(file);
          // Reset so picking the same file twice still fires a change event.
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded bg-secondary px-2.5 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-50"
        >
          {upload.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ImagePlus className="size-3.5" />
          )}
          {hasCustom ? "Replace image" : "Upload image"}
        </button>

        {hasCustom && (
          <button
            type="button"
            onClick={() => revert.mutate()}
            disabled={busy}
            title="Go back to the frame taken from the video"
            className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RotateCcw className="size-3.5" />
            Use video frame
          </button>
        )}
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <p className="text-[11px] text-muted-foreground/70">
        {hasCustom
          ? "Your image is shown on tiles and in the hero."
          : "Using a frame from the video. Cropped to 16:9 on upload."}
      </p>
    </div>
  );
}
