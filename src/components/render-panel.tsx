"use client";

import { Copy } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRenderPrompt } from "@/hooks/use-prompt-mutations";
import { extractVariables } from "@/lib/render-template";
import type { Prompt } from "@/lib/types";

/** Interactive render tester: one input per detected variable → substituted output. */
export function RenderPanel({ prompt }: { prompt: Prompt }) {
  const variables = useMemo(
    () => extractVariables(prompt.template),
    [prompt.template],
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const render = useRenderPrompt(prompt.id);

  const run = () =>
    render.mutate(values, {
      onError: (e) => toast.error(e.message),
    });

  return (
    <div className="space-y-4">
      {variables.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This template has no{" "}
          <code className="font-mono">{"{{variables}}"}</code> — rendering
          returns it as-is.
        </p>
      ) : (
        <div className="space-y-3">
          {variables.map((name) => (
            <div key={name} className="space-y-1.5">
              <Label htmlFor={`var-${name}`} className="font-mono text-xs">
                {`{{${name}}}`}
              </Label>
              <Input
                id={`var-${name}`}
                value={values[name] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [name]: e.target.value }))
                }
                placeholder={`Value for ${name}`}
              />
            </div>
          ))}
        </div>
      )}

      <Button onClick={run} disabled={render.isPending}>
        {render.isPending ? "Rendering…" : "Render"}
      </Button>

      {render.data && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Output</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!render.data) return;
                try {
                  await navigator.clipboard.writeText(render.data.output);
                  toast.success("Copied");
                } catch {
                  toast.error("Couldn't copy to clipboard");
                }
              }}
            >
              <Copy className="size-3.5" /> Copy
            </Button>
          </div>
          <pre className="whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-3 font-mono text-sm">
            {render.data.output}
          </pre>
          {render.data.missing.length > 0 && (
            <p className="text-sm text-destructive">
              Missing values for: {render.data.missing.join(", ")} — left as
              placeholders.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
