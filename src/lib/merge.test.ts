import { describe, expect, it } from "bun:test";
import { buildMergedContent, mergePrompt, type PromptContent } from "./merge";

/** Build a PromptContent with overrides — keeps each case focused on one field. */
function content(overrides: Partial<PromptContent> = {}): PromptContent {
  return {
    title: "Title",
    description: "Description",
    template: "Template {{x}}",
    tags: ["a", "b"],
    ...overrides,
  };
}

describe("mergePrompt — scalar fields", () => {
  it("marks a field unchanged when neither side edited it", () => {
    const m = mergePrompt(content(), content(), content());
    expect(m.template.status).toBe("unchanged");
    expect(m.template.value).toBe("Template {{x}}");
    expect(m.hasConflicts).toBe(false);
    expect(m.hasChanges).toBe(false);
  });

  it("marks a field unchanged when both sides made the same edit", () => {
    const edited = content({ template: "same rewrite" });
    const m = mergePrompt(content(), edited, edited);
    expect(m.template.status).toBe("unchanged");
    expect(m.template.value).toBe("same rewrite");
    expect(m.hasConflicts).toBe(false);
    // Both already hold the value — nothing to change on the customer's copy.
    expect(m.hasChanges).toBe(false);
  });

  it("adopts internal's value when only internal changed (a free improvement)", () => {
    const m = mergePrompt(
      content(),
      content(),
      content({ description: "improved" }),
    );
    expect(m.description.status).toBe("internal");
    expect(m.description.value).toBe("improved");
    expect(m.hasConflicts).toBe(false);
    expect(m.hasChanges).toBe(true);
  });

  it("keeps the customer's value when only the customer changed", () => {
    const m = mergePrompt(
      content(),
      content({ template: "my version {{x}}" }),
      content(),
    );
    expect(m.template.status).toBe("customer");
    expect(m.template.value).toBe("my version {{x}}");
    expect(m.hasConflicts).toBe(false);
    // The customer already holds this value — accepting changes nothing.
    expect(m.hasChanges).toBe(false);
  });

  it("flags a conflict when both sides changed a field differently", () => {
    const m = mergePrompt(
      content(),
      content({ template: "customer version" }),
      content({ template: "internal version" }),
    );
    expect(m.template.status).toBe("conflict");
    expect(m.template.value).toBeUndefined();
    expect(m.hasConflicts).toBe(true);
    expect(m.hasChanges).toBe(true);
  });

  it("resolves each field independently (the core Q2 scenario)", () => {
    // Internal improved the description; the customer only touched the template.
    const m = mergePrompt(
      content(),
      content({ template: "customer template" }),
      content({ description: "internal description" }),
    );
    expect(m.description.status).toBe("internal");
    expect(m.template.status).toBe("customer");
    expect(m.title.status).toBe("unchanged");
    expect(m.hasConflicts).toBe(false);
  });
});

describe("mergePrompt — tags (3-way set merge)", () => {
  const tags = (base: string[], customer: string[], internal: string[]) =>
    mergePrompt(
      content({ tags: base }),
      content({ tags: customer }),
      content({ tags: internal }),
    ).tags;

  it("keeps a base tag only if neither side removed it", () => {
    const t = tags(["a", "b"], ["a", "b"], ["a"]);
    expect(t.value).toEqual(["a"]);
  });

  it("does not resurrect a tag the customer explicitly removed", () => {
    // A naive customer ∪ internal union would bring "a" back.
    const t = tags(["a"], [], ["a"]);
    expect(t.value).toEqual([]);
  });

  it("includes tags newly added by either side, deduplicated", () => {
    const t = tags(["a"], ["a", "mine"], ["a", "theirs", "mine"]);
    expect(t.value.sort()).toEqual(["a", "mine", "theirs"]);
  });

  it("reports added/removed relative to the customer's current tags", () => {
    // Internal removed "a" and added "c"; customer added "mine".
    const t = tags(["a", "b"], ["a", "b", "mine"], ["b", "c"]);
    expect(t.value.sort()).toEqual(["b", "c", "mine"]);
    expect(t.added).toEqual(["c"]);
    expect(t.removed).toEqual(["a"]);
  });

  it("tag changes alone set hasChanges", () => {
    const m = mergePrompt(
      content({ tags: ["a"] }),
      content({ tags: ["a"] }),
      content({ tags: ["a", "new"] }),
    );
    expect(m.hasConflicts).toBe(false);
    expect(m.hasChanges).toBe(true);
  });
});

describe("buildMergedContent", () => {
  const conflicted = mergePrompt(
    content(),
    content({ template: "customer version", title: "customer title" }),
    content({ template: "internal version", title: "internal title" }),
  );

  it("defaults unresolved conflicts to the customer's value (keep mine)", () => {
    const merged = buildMergedContent(conflicted);
    expect(merged.template).toBe("customer version");
    expect(merged.title).toBe("customer title");
  });

  it("applies explicit picks per field", () => {
    const merged = buildMergedContent(conflicted, {
      template: "internal",
      // title left unpicked → keep mine
    });
    expect(merged.template).toBe("internal version");
    expect(merged.title).toBe("customer title");
  });

  it("ignores picks for fields that are not in conflict", () => {
    const m = mergePrompt(
      content(),
      content(),
      content({ description: "improved" }),
    );
    // A (stale) pick on a non-conflicting field must not override auto-resolution.
    const merged = buildMergedContent(m, { description: "customer" });
    expect(merged.description).toBe("improved");
  });

  it("uses the auto-merged tag set", () => {
    const m = mergePrompt(
      content({ tags: ["a"] }),
      content({ tags: ["a", "mine"] }),
      content({ tags: ["a", "theirs"] }),
    );
    expect(buildMergedContent(m).tags.sort()).toEqual(["a", "mine", "theirs"]);
  });
});
