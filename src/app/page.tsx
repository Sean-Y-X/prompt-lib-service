"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PromptCard } from "@/components/prompt-card";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePrompts } from "@/hooks/use-prompts";

type Filter = "all" | "internal" | "custom";

export default function LibraryPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 250);

  const { data, isLoading, isError, error } = usePrompts({
    q: debouncedSearchQuery || undefined,
    kind: filter === "all" ? undefined : filter,
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Prompt Library
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage, discover, render, and reconcile prompts.
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/prompts/new" />}>
          <Plus className="size-4" /> New Prompt
        </Button>
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title, description, or tag…"
          className="sm:max-w-sm"
        />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { label: "All", value: "all" },
            { label: "Internal", value: "internal" },
            { label: "Yours", value: "custom" },
          ]}
        />
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">
            Failed to load prompts: {(error as Error).message}
          </p>
        ) : !data || data.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            {debouncedSearchQuery || filter !== "all"
              ? "No prompts match your search."
              : "No prompts yet — create your first one."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.map((prompt) => (
              <PromptCard
                key={prompt.id}
                prompt={prompt}
                updateAvailable={prompt.updateAvailable}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
