// Copyright 2026 atelierlavee
// SPDX-License-Identifier: Apache-2.0

import { AppShell } from "@/components/AppShell";
import { PageBody } from "@/components/PageBody";
import { YouTabs } from "@/components/YouTabs";
import { ActivityLog } from "@/components/ActivityLog";

/** Everything that happened in your library, newest first: the You area's Activity tab. */
export function ActivityPage() {
  return (
    <AppShell
      title="Your activity"
      subtitle="Everything that happened in your library, newest first."
      actions={<YouTabs />}
    >
      <PageBody className="max-w-6xl">
        <ActivityLog />
      </PageBody>
    </AppShell>
  );
}
