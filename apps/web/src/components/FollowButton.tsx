// Copyright 2026 Vivek Jaiswal
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { UserCheck, UserPlus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/lib/toast";
import { qk } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";

/**
 * Follow or unfollow a performer or studio, for the current profile.
 *
 * Their new videos then show in the "New from who you follow" home row, the
 * Following browse filter and the notification bell. `onToggle` does the
 * write and refreshes the page it sits on; the lists that read following are
 * refreshed here, so every caller gets them for free.
 */
export function FollowButton({
  followed,
  name,
  onToggle,
  tone = "default",
  iconOnly = false,
}: {
  followed: boolean;
  name: string;
  onToggle: (next: boolean) => Promise<void>;
  /** "overlay" for a button drawn on a banner image. */
  tone?: "default" | "overlay";
  /** Just the icon, round, pink once followed. */
  iconOnly?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  async function toggle() {
    setPending(true);
    try {
      await onToggle(!followed);
      void queryClient.invalidateQueries({ queryKey: qk.mediaItems.all });
      void queryClient.invalidateQueries({ queryKey: qk.followingSummary });
      void queryClient.invalidateQueries({ queryKey: qk.following.all });
      void queryClient.invalidateQueries({ queryKey: qk.performers.all });
      void queryClient.invalidateQueries({ queryKey: qk.studios.all });
      toast({
        title: followed ? `Unfollowed ${name}` : `Following ${name}`,
        description: followed ? undefined : "Their new videos will show on your home page.",
      });
    } catch (error) {
      toast({
        title: "That didn't work",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setPending(false);
    }
  }

  const Icon = followed ? UserCheck : UserPlus;
  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={pending}
        aria-pressed={followed}
        aria-label={followed ? `Unfollow ${name}` : `Follow ${name}`}
        title={followed ? `Following — click to unfollow` : `Follow ${name} for their new videos`}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-secondary disabled:opacity-50",
          followed ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Icon className="size-4" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={pending}
      aria-pressed={followed}
      title={followed ? `Following — click to unfollow` : `Follow ${name} for their new videos`}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors disabled:opacity-50",
        tone === "overlay"
          ? followed
            ? "bg-white text-black hover:bg-white/90"
            : "bg-black/50 text-white ring-1 ring-white/25 backdrop-blur-sm hover:bg-black/70"
          : followed
            ? "bg-white text-black hover:bg-white/90"
            : "bg-secondary text-foreground hover:bg-accent",
      )}
    >
      <Icon className="size-3.5" />
      {followed ? "Following" : "Follow"}
    </button>
  );
}
