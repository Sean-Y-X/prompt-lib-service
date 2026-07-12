"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/segmented";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreatePrompt,
  useDraftPrompt,
  useUpdatePrompt,
} from "@/hooks/use-prompt-mutations";
import type { PromptContent, PromptKind } from "@/lib/types";

type Props =
  | { mode: "create" }
  | { mode: "edit"; id: string; initial: PromptContent };

const EMPTY: PromptContent = {
  title: "",
  description: "",
  template: "",
  tags: [],
};

export function PromptForm(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === "edit";

  const [content, setContent] = useState<PromptContent>(
    isEdit ? props.initial : EMPTY,
  );
  const [kind, setKind] = useState<PromptKind>("custom");
  const [brief, setBrief] = useState("");

  const create = useCreatePrompt();
  const update = useUpdatePrompt(isEdit ? props.id : "");
  const draft = useDraftPrompt();

  const set = <K extends keyof PromptContent>(
    key: K,
    value: PromptContent[K],
  ) => setContent((c) => ({ ...c, [key]: value }));

  const generate = () => {
    if (!brief.trim()) return;
    draft.mutate(brief, {
      onSuccess: (d) => {
        setContent(d);
        toast.success("Draft generated — review and edit before saving.");
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.title.trim() || !content.template.trim()) {
      toast.error("Title and template are required.");
      return;
    }
    if (isEdit) {
      update.mutate(content, {
        onSuccess: (p) => {
          toast.success("Prompt updated.");
          router.push(`/prompts/${p.id}`);
        },
        onError: (err) => toast.error(err.message),
      });
    } else {
      create.mutate(
        { kind, content },
        {
          onSuccess: (p) => {
            toast.success("Prompt created.");
            router.push(`/prompts/${p.id}`);
          },
          onError: (err) => toast.error(err.message),
        },
      );
    }
  };

  const saving = create.isPending || update.isPending;

  return (
    <form onSubmit={submit} className="space-y-6">
      {!isEdit && (
        <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4 text-primary" />
            Draft with AI
          </div>
          <p className="text-sm text-muted-foreground">
            Describe what you want; we&apos;ll draft the fields for you to
            review.
          </p>
          <div className="flex gap-2">
            <Input
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="e.g. Summarize a support call into 3 bullets and a sentiment"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  generate();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={generate}
              disabled={draft.isPending || !brief.trim()}
            >
              {draft.isPending ? "Generating…" : "Generate"}
            </Button>
          </div>
        </div>
      )}

      {!isEdit && (
        <div className="space-y-2">
          <Label>Kind</Label>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { label: "Yours (custom)", value: "custom" },
              { label: "Internal source", value: "internal" },
            ]}
          />
          <p className="text-xs text-muted-foreground">
            Internal prompts act as sources that customer copies can fork and
            receive updates from.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={content.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Customer Support Classifier"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={content.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Classifies support tickets"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="template">Template</Label>
        <Textarea
          id="template"
          value={content.template}
          onChange={(e) => set("template", e.target.value)}
          placeholder="Classify this ticket: {{ticket}}"
          className="min-h-40 font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Use <code className="font-mono">{"{{variable}}"}</code> placeholders
          for inputs filled in at render time.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Tags</Label>
        <TagInput value={content.tags} onChange={(tags) => set("tags", tags)} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : isEdit ? "Save changes" : "Create prompt"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
