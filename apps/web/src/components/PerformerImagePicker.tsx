import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deletePerformerImage,
  uploadPerformerImage,
  type PerformerImageKind,
} from "@/lib/performerApi";
import { invalidatePerformer } from "@/lib/invalidate";

/**
 * Upload / replace / remove control for one performer image.
 *
 * Rendered as an overlay on the thing it edits, so there's no separate
 * settings surface to go and find.
 */
export function PerformerImagePicker({
  performerId,
  kind,
  hasImage,
  className,
  onUploaded,
}: {
  performerId: number;
  kind: PerformerImageKind;
  hasImage: boolean;
  className?: string;
  /**
   * Fired after a successful upload, so the caller can drop straight into
   * framing. A freshly uploaded picture is exactly when you know how you want
   * it cropped — making that a separate button you have to remember later is
   * how images end up badly framed forever.
   */
  onUploaded?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  function invalidate() {
    invalidatePerformer(queryClient, performerId);
  }

  const upload = useMutation({
    mutationFn: (file: File) => uploadPerformerImage(performerId, kind, file),
    onSuccess: () => {
      setError(null);
      invalidate();
      onUploaded?.();
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: () => deletePerformerImage(performerId, kind),
    onSuccess: invalidate,
  });

  const busy = upload.isPending || remove.isPending;
  const label = kind === "banner" ? "banner" : "photo";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
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

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1.5 text-xs font-medium text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-black/80 disabled:opacity-50"
      >
        {upload.isPending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <ImagePlus className="size-3.5" />
        )}
        {hasImage ? `Change ${label}` : `Add ${label}`}
      </button>

      {hasImage && (
        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={busy}
          aria-label={`Remove ${label}`}
          title={`Remove ${label}`}
          className="rounded-md bg-black/60 p-1.5 text-white ring-1 ring-white/20 backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}

      {error && (
        <span className="rounded bg-destructive/90 px-2 py-1 text-xs text-white">{error}</span>
      )}
    </div>
  );
}
