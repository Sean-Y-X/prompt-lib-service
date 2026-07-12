"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { KindBadge } from "@/components/kind-badge";
import { RenderPanel } from "@/components/render-panel";
import { TemplateText } from "@/components/template-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePrompt } from "@/hooks/use-prompts";

export default function PromptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: prompt, isLoading, isError } = usePrompt(id);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-4 h-64 w-full" />
      </main>
    );
  }

  if (isError || !prompt) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <BackLink />
        <p className="mt-6 text-sm text-destructive">Prompt not found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <BackLink />

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {prompt.title}
            </h1>
            <KindBadge kind={prompt.kind} />
          </div>
          {prompt.description && (
            <p className="text-sm text-muted-foreground">
              {prompt.description}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/prompts/${prompt.id}/edit`} />}
        >
          <Pencil className="size-4" /> Edit
        </Button>
      </div>

      {prompt.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {prompt.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <Tabs defaultValue="overview" className="mt-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="render">Render</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-6">
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Template</h2>
            <TemplateText template={prompt.template} />
          </div>

          <Separator />

          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Stat label="Renders" value={String(prompt.renderCount)} />
            <Stat
              label="Last used"
              value={
                prompt.lastRenderedAt
                  ? new Date(prompt.lastRenderedAt).toLocaleString()
                  : "Never"
              }
            />
            <Stat label="Version" value={`v${prompt.currentVersion}`} />
            <Stat
              label="Created"
              value={new Date(prompt.createdAt).toLocaleDateString()}
            />
          </dl>
        </TabsContent>

        <TabsContent value="render" className="mt-4">
          <RenderPanel prompt={prompt} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
