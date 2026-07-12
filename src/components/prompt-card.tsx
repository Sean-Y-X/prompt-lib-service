import { ArrowUpCircle } from "lucide-react";
import Link from "next/link";
import { KindBadge } from "@/components/kind-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Prompt } from "@/lib/types";

export function PromptCard({
  prompt,
  updateAvailable = false,
}: {
  prompt: Prompt;
  updateAvailable?: boolean;
}) {
  return (
    <Link href={`/prompts/${prompt.id}`} className="block">
      <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">
              {prompt.title}
            </CardTitle>
            <div className="flex shrink-0 items-center gap-1">
              {updateAvailable && (
                <span
                  role="img"
                  aria-label="Update available"
                  title="Update available"
                  className="text-primary"
                >
                  <ArrowUpCircle className="size-4" />
                </span>
              )}
              <KindBadge kind={prompt.kind} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {prompt.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {prompt.description}
            </p>
          )}
          {prompt.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {prompt.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {prompt.renderCount} render{prompt.renderCount === 1 ? "" : "s"}
            {prompt.lastRenderedAt
              ? ` · last used ${new Date(prompt.lastRenderedAt).toLocaleDateString()}`
              : ""}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
