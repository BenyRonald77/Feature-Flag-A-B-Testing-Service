import { NextRequest, NextResponse } from "next/server";
import { evaluateFlag } from "@/lib/evaluation-service";

export const dynamic = "force-dynamic";

/**
 * Endpoint publik yang dipanggil aplikasi klien untuk mengecek status flag
 * - inilah yang membuat toggle di dashboard langsung berlaku TANPA redeploy
 * klien, karena klien selalu membaca status terbaru dari sini.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const flagKey = searchParams.get("flagKey");
  const userId = searchParams.get("userId");

  if (!flagKey || !userId) {
    return NextResponse.json({ error: "flagKey dan userId wajib diisi" }, { status: 400 });
  }

  const result = await evaluateFlag(flagKey, userId);
  return NextResponse.json(result);
}
