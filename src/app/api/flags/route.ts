import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { FLAG_TYPES } from "@/lib/types";

const createSchema = z.object({
  key: z.string().min(2).regex(/^[a-z0-9-_]+$/, "Hanya huruf kecil, angka, - dan _"),
  name: z.string().min(2),
  description: z.string().optional(),
  type: z.enum(FLAG_TYPES),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const flags = await prisma.flag.findMany({
    include: { variants: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ flags });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.flag.findUnique({ where: { key: parsed.data.key } });
  if (existing) {
    return NextResponse.json({ error: "Key flag sudah dipakai" }, { status: 409 });
  }

  const flag = await prisma.flag.create({ data: parsed.data });
  return NextResponse.json({ flag }, { status: 201 });
}
