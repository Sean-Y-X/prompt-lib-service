import { describe, expect, it } from "bun:test";
import { extractVariables, renderTemplate } from "./render-template";

describe("extractVariables", () => {
  it("returns distinct variables in first-seen order", () => {
    expect(extractVariables("{{b}} then {{a}} then {{b}}")).toEqual(["b", "a"]);
  });

  it("tolerates inner whitespace", () => {
    expect(extractVariables("Hi {{ name }}!")).toEqual(["name"]);
  });

  it("accepts _, . and - in names", () => {
    expect(extractVariables("{{user_id}} {{a.b}} {{x-y}}")).toEqual([
      "user_id",
      "a.b",
      "x-y",
    ]);
  });

  it("ignores malformed placeholders", () => {
    // Single braces, empty names, and names with spaces are not variables.
    expect(extractVariables("{x} {{}} {{a b}}")).toEqual([]);
  });

  it("returns empty for a template with no variables", () => {
    expect(extractVariables("plain text")).toEqual([]);
  });
});

describe("renderTemplate", () => {
  it("substitutes supplied variables (the assignment's example)", () => {
    const { output, missing } = renderTemplate(
      "Classify this ticket: {{ticket}}",
      { ticket: "I was charged twice." },
    );
    expect(output).toBe("Classify this ticket: I was charged twice.");
    expect(missing).toEqual([]);
  });

  it("substitutes every occurrence of a repeated variable", () => {
    const { output } = renderTemplate("{{x}} and {{x}}", { x: "y" });
    expect(output).toBe("y and y");
  });

  it("leaves missing placeholders intact and reports each name once", () => {
    const { output, missing } = renderTemplate("{{a}} {{b}} {{a}}", {
      b: "B",
    });
    expect(output).toBe("{{a}} B {{a}}");
    expect(missing).toEqual(["a"]);
  });

  it("treats an empty string as a provided value, not missing", () => {
    const { output, missing } = renderTemplate("[{{x}}]", { x: "" });
    expect(output).toBe("[]");
    expect(missing).toEqual([]);
  });

  it("inserts values containing replacement patterns literally", () => {
    // '$&' is special in String.replace with a string arg; the function form
    // must keep it literal.
    const { output } = renderTemplate("{{x}}", { x: "$& $' $1" });
    expect(output).toBe("$& $' $1");
  });

  it("does not substitute extra variables that the template never references", () => {
    const { output, missing } = renderTemplate("no vars", { x: "y" });
    expect(output).toBe("no vars");
    expect(missing).toEqual([]);
  });
});
