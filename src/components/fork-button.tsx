"use client";

import { GitFork } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useForkPrompt } from "@/hooks/use-prompt-updates";

/** "Use this prompt": fork an internal source into a new customer copy. */
export function ForkButton({ promptId }: { promptId: string }) {
  const router = useRouter();
  const fork = useForkPrompt();

  return (
    <Button
      disabled={fork.isPending}
      onClick={() =>
        fork.mutate(
          { id: promptId },
          {
            onSuccess: (created) => {
              toast.success("Forked into your copy.");
              router.push(`/prompts/${created.id}`);
            },
            onError: (e) => toast.error(e.message),
          },
        )
      }
    >
      <GitFork className="size-4" />
      {fork.isPending ? "Forking…" : "Use this prompt"}
    </Button>
  );
}
