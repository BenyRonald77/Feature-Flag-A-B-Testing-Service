import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordConversion } from "@/lib/evaluation-service";

const schema = z.object({ flagKey: z.string().min(1), userId: z.string().min(1) });

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const event = await recordConversion(parsed.data.flagKey, parsed.data.userId);
  if (!event) {
    return NextResponse.json({ error: "Flag tidak ditemukan atau user belum pernah di-exposed" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, event });
}
