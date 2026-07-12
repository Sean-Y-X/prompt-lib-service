import { Badge } from "@/components/ui/badge";
import type { PromptKind } from "@/lib/types";

/** Visual marker for whether a prompt is an internal source or the customer's copy. */
export function KindBadge({ kind }: { kind: PromptKind }) {
  return kind === "internal" ? (
    <Badge variant="secondary">Internal</Badge>
  ) : (
    <Badge variant="outline">Yours</Badge>
  );
}
