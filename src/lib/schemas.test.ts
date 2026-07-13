import { describe, expect, it } from "bun:test";
import {
  acceptUpdateSchema,
  createPromptSchema,
  updatePromptSchema,
} from "./schemas";

describe("createPromptSchema", () => {
  it("defaults kind, description, and tags on create", () => {
    const parsed = createPromptSchema.parse({
      content: { title: "t", template: "x" },
    });
    expect(parsed.kind).toBe("custom");
    expect(parsed.content.description).toBe("");
    expect(parsed.content.tags).toEqual([]);
  });

  it("requires title and template", () => {
    expect(
      createPromptSchema.safeParse({ content: { title: "", template: "x" } })
        .success,
    ).toBe(false);
    expect(
      createPromptSchema.safeParse({ content: { title: "t", template: "" } })
        .success,
    ).toBe(false);
  });

  it("caps the template at 10k chars", () => {
    const at = { content: { title: "t", template: "x".repeat(10_000) } };
    const over = { content: { title: "t", template: "x".repeat(10_001) } };
    expect(createPromptSchema.safeParse(at).success).toBe(true);
    expect(createPromptSchema.safeParse(over).success).toBe(false);
  });
});

describe("updatePromptSchema", () => {
  it("rejects an empty patch", () => {
    expect(updatePromptSchema.safeParse({}).success).toBe(false);
  });

  it("does NOT inject defaults into a partial patch", () => {
    // Regression guard for the create-only-defaults design: if description/tags
    // defaulted on the shared content schema, a title-only PATCH would arrive as
    // { title, description: "", tags: [] } and silently wipe those fields.
    const parsed = updatePromptSchema.parse({ title: "new title" });
    expect(parsed).toEqual({ title: "new title" });
    expect("description" in parsed).toBe(false);
    expect("tags" in parsed).toBe(false);
  });

  it("accepts any single content field", () => {
    expect(updatePromptSchema.safeParse({ tags: ["a"] }).success).toBe(true);
    expect(updatePromptSchema.safeParse({ template: "x" }).success).toBe(true);
  });
});

describe("acceptUpdateSchema", () => {
  it("defaults resolutions to empty (all conflicts → keep mine)", () => {
    expect(acceptUpdateSchema.parse({}).resolutions).toEqual({});
  });

  it("accepts per-field picks", () => {
    const parsed = acceptUpdateSchema.parse({
      resolutions: { template: "internal", title: "customer" },
    });
    expect(parsed.resolutions.template).toBe("internal");
  });

  it("expectedSourceVersion is optional but must be a positive integer", () => {
    expect(acceptUpdateSchema.safeParse({}).success).toBe(true);
    expect(
      acceptUpdateSchema.safeParse({ expectedSourceVersion: 3 }).success,
    ).toBe(true);
    expect(
      acceptUpdateSchema.safeParse({ expectedSourceVersion: 0 }).success,
    ).toBe(false);
    expect(
      acceptUpdateSchema.safeParse({ expectedSourceVersion: 1.5 }).success,
    ).toBe(false);
  });
});
