import { cn } from "@/lib/utils";

// Split on {{variable}} placeholders while keeping them (capturing group).
const SPLIT_RE = /(\{\{\s*[a-zA-Z0-9_.-]+\s*\}\})/g;
const IS_VAR_RE = /^\{\{\s*[a-zA-Z0-9_.-]+\s*\}\}$/;

/** Render a template with its `{{variables}}` visually highlighted. */
export function TemplateText({
  template,
  className,
}: {
  template: string;
  className?: string;
}) {
  const parts = template.split(SPLIT_RE);
  return (
    <pre
      className={cn(
        "whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 font-mono text-sm",
        className,
      )}
    >
      {parts.map((part, i) =>
        IS_VAR_RE.test(part) ? (
          <span
            key={`${i}-${part}`}
            className="rounded bg-primary/15 px-1 font-medium text-primary"
          >
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </pre>
  );
}
