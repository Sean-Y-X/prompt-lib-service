import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";

/** Consistent JSON error envelope across all routes. */
export function jsonError(message: string, status: number, extra?: unknown) {
  return NextResponse.json({ error: message, details: extra }, { status });
}

export function notFound(message = "Not found") {
  return jsonError(message, 404);
}

export function validationError(error: ZodError) {
  return jsonError("Validation failed", 400, error.issues);
}

/**
 * Parse and validate a JSON request body against a zod schema. Returns either the
 * typed data or a ready-to-return 400 response, so handlers can early-return.
 */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: jsonError("Invalid JSON body", 400) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { error: validationError(result.error) };
  }
  return { data: result.data };
}
