import { NextResponse } from "next/server";
import { getUpdateStatus } from "@/db/queries";
import { notFound } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/prompts/:id/updates — reconciliation status + field-level merge preview.
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const status = await getUpdateStatus(id);
  if (!status) return notFound("Prompt not found");
  return NextResponse.json(status);
}
