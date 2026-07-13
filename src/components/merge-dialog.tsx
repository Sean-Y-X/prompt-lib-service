"use client";

import { useState } from "react";
import { toast } from "sonner";
import { DiffView } from "@/components/diff-view";
import { Segmented } from "@/components/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAcceptUpdate, useDismissUpdate } from "@/hooks/use-prompt-updates";
import type { ScalarField, ScalarMerge } from "@/lib/merge";
import type { UpdateStatus } from "@/lib/types";

const SCALAR_FIELDS: { field: ScalarField; label: string }[] = [
  { field: "title", label: "Title" },
  { field: "description", label: "Description" },
  { field: "template", label: "Template" },
];

export function MergeDialog({
  promptId,
  status,
  open,
  onOpenChange,
}: {
  promptId: string;
  status: UpdateStatus;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const merge = status.merge;
  const conflictFields = SCALAR_FIELDS.filter(
    ({ field }) => merge?.[field].status === "conflict",
  );

  // Default every conflict to "keep mine" — the safe, no-data-loss choice.
  const [picks, setPicks] = useState<
    Partial<Record<ScalarField, "customer" | "internal">>
  >(() =>
    Object.fromEntries(conflictFields.map(({ field }) => [field, "customer"])),
  );

  const accept = useAcceptUpdate(promptId);
  const dismiss = useDismissUpdate(promptId);
  const busy = accept.isPending || dismiss.isPending;

  if (!merge) return null;

  const onAccept = () =>
    accept.mutate(picks, {
      onSuccess: () => {
        toast.success("Internal update applied.");
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message),
    });

  const onKeepMine = () =>
    dismiss.mutate(
      {},
      {
        onSuccess: () => {
          toast.success("Kept your version.");
          onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  const tagsChanged =
    merge.tags.added.length > 0 || merge.tags.removed.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review internal update</DialogTitle>
          <DialogDescription>
            The internal source advanced to v{status.sourceVersion} (you synced
            from v{status.syncedVersion}).{" "}
            {merge.hasConflicts
              ? "Some fields you edited also changed upstream — choose which to keep."
              : "Your edits are preserved; internal improvements are applied automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {!merge.hasChanges && (
            <p className="text-sm text-muted-foreground">
              The source advanced but there is nothing new to merge into your
              copy. Accepting simply marks you up to date.
            </p>
          )}

          {SCALAR_FIELDS.map(({ field, label }) => (
            <ScalarFieldRow
              key={field}
              label={label}
              merge={merge[field]}
              pick={picks[field]}
              onPick={(value) => setPicks((p) => ({ ...p, [field]: value }))}
            />
          ))}

          {tagsChanged && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Tags</span>
                <Badge variant="secondary">Auto-merged</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {merge.tags.value.map((tag) => (
                  <Badge
                    key={tag}
                    variant={
                      merge.tags.added.includes(tag) ? "default" : "outline"
                    }
                  >
                    {merge.tags.added.includes(tag) ? `+ ${tag}` : tag}
                  </Badge>
                ))}
                {merge.tags.removed.map((tag) => (
                  <Badge
                    key={`removed-${tag}`}
                    variant="outline"
                    className="text-muted-foreground line-through opacity-60"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onKeepMine} disabled={busy}>
            Keep mine
          </Button>
          <Button onClick={onAccept} disabled={busy}>
            {accept.isPending ? "Applying…" : "Accept update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: ScalarMerge["status"] }) {
  if (status === "internal") {
    return (
      <Badge className="bg-green-500/15 text-green-700 dark:text-green-300">
        Adopting update
      </Badge>
    );
  }
  if (status === "customer") {
    return <Badge variant="outline">Your change kept</Badge>;
  }
  return (
    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
      Conflict — choose one
    </Badge>
  );
}

function ScalarFieldRow({
  label,
  merge,
  pick,
  onPick,
}: {
  label: string;
  merge: ScalarMerge;
  pick?: "customer" | "internal";
  onPick: (value: "customer" | "internal") => void;
}) {
  if (merge.status === "unchanged") return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{label}</span>
        <StatusBadge status={merge.status} />
      </div>

      {merge.status === "internal" && (
        <DiffView before={merge.customer} after={merge.internal} />
      )}

      {merge.status === "customer" && (
        <p className="rounded-md border bg-muted/30 p-2 font-mono text-xs">
          {merge.customer || (
            <span className="text-muted-foreground">(empty)</span>
          )}
        </p>
      )}

      {merge.status === "conflict" && (
        <div className="space-y-2">
          <DiffView before={merge.customer} after={merge.internal} />
          <Segmented
            value={pick ?? "customer"}
            onChange={onPick}
            options={[
              { label: "Keep mine", value: "customer" },
              { label: "Take theirs", value: "internal" },
            ]}
          />
        </div>
      )}
    </div>
  );
}
