"use client";

import { ArrowUpCircle } from "lucide-react";
import { useState } from "react";
import { MergeDialog } from "@/components/merge-dialog";
import { Button } from "@/components/ui/button";
import type { UpdateStatus } from "@/lib/types";

/** Shown on a customer copy when its internal source has a newer version. */
export function UpdateBanner({
  promptId,
  status,
}: {
  promptId: string;
  status: UpdateStatus;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-sm">
        <ArrowUpCircle className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          An update is available from the internal source (v
          {status.syncedVersion} → v{status.sourceVersion}).
          {status.hasLocalChanges
            ? " You have local changes — review before applying."
            : ""}
        </span>
      </div>
      <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}>
        Review update
      </Button>
      <MergeDialog
        // Remount (resetting conflict picks) if the source publishes again while
        // this banner stays mounted, so stale picks can't carry over.
        key={status.sourceVersion ?? "none"}
        promptId={promptId}
        status={status}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  );
}
