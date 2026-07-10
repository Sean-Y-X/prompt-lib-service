/**
 * Prompt templates use `{{variable}}` placeholders (optional inner whitespace,
 * e.g. `{{ ticket }}`). Variable names are alphanumeric plus `_`, `.` and `-`.
 */
const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

/** Distinct variable names referenced in a template, in first-seen order. */
export function extractVariables(template: string): string[] {
  const seen = new Set<string>();
  for (const match of template.matchAll(VARIABLE_RE)) {
    seen.add(match[1]);
  }
  return [...seen];
}

export interface RenderResult {
  output: string;
  /** Variables referenced in the template but absent from the supplied values. */
  missing: string[];
}

/**
 * Substitute `{{variable}}` placeholders with supplied values. Placeholders with
 * no matching value are left intact and reported in `missing`, so callers can warn
 * rather than silently emitting a half-rendered prompt.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>,
): RenderResult {
  const missing = new Set<string>();
  const output = template.replace(VARIABLE_RE, (whole, name: string) => {
    if (Object.hasOwn(variables, name)) {
      return variables[name];
    }
    missing.add(name);
    return whole;
  });
  return { output, missing: [...missing] };
}
