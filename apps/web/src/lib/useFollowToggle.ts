// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setPerformerFollowed } from "./performerApi";
import { setStudioFollowed } from "./studioApi";
import { qk } from "./queryKeys";
import { useToast } from "./toast";

export type FollowTarget = { kind: "performer" | "studio"; id: number; name: string };

/**
 * Follow or unfollow, with everything that depends on it refreshed and a
 * toast either way — one copy for the feed, its sidebar and anything else
 * that offers the button. `pending` names the one in flight, as
 * "performer:12", so a button can show it is working.
 */
export function useFollowToggle() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = useState<string | null>(null);

  async function setFollowed(target: FollowTarget, follow: boolean) {
    setPending(`${target.kind}:${target.id}`);
    try {
      if (target.kind === "performer") await setPerformerFollowed(target.id, follow);
      else await setStudioFollowed(target.id, follow);
      for (const queryKey of [
        qk.following.all,
        qk.followingSummary,
        qk.mediaItems.all,
        qk.performers.all,
        qk.studios.all,
        target.kind === "performer" ? qk.performer.all : qk.studio.all,
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
      toast({ title: follow ? `Following ${target.name}` : `Unfollowed ${target.name}` });
    } catch (error) {
      toast({
        title: "That didn't work",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setPending(null);
    }
  }

  return { setFollowed, pending };
}
