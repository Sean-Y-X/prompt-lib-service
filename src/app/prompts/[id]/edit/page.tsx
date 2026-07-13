"use client";

import { useParams } from "next/navigation";
import { BackLink } from "@/components/back-link";
import { PromptForm } from "@/components/prompt-form";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrompt } from "@/hooks/use-prompts";

export default function EditPromptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: prompt, isLoading, isError } = usePrompt(id);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <BackLink href={`/prompts/${id}`}>Back to prompt</BackLink>
      <h1 className="mt-4 mb-6 text-2xl font-semibold tracking-tight">
        Edit Prompt
      </h1>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : isError || !prompt ? (
        <p className="text-sm text-destructive">Prompt not found.</p>
      ) : (
        <PromptForm
          mode="edit"
          id={prompt.id}
          kind={prompt.kind}
          initial={{
            title: prompt.title,
            description: prompt.description,
            template: prompt.template,
            tags: prompt.tags,
          }}
        />
      )}
    </main>
  );
}
