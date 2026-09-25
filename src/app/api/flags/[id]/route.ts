import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  rolloutPercentage: z.number().int().min(0).max(100).optional(),
  description: z.string().optional(),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const flag = await prisma.flag.findUnique({ where: { id: params.id }, include: { variants: true } });
  if (!flag) {
    return NextResponse.json({ error: "Flag tidak ditemukan" }, { status: 404 });
  }

  return NextResponse.json({ flag });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const flag = await prisma.flag.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json({ flag });
}
