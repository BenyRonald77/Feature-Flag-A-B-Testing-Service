import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({
  key: z.string().min(1).regex(/^[a-z0-9-_]+$/, "Hanya huruf kecil, angka, - dan _"),
  name: z.string().min(1),
  trafficPercentage: z.number().int().min(1).max(100),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const flag = await prisma.flag.findUnique({ where: { id: params.id }, include: { variants: true } });
  if (!flag) {
    return NextResponse.json({ error: "Flag tidak ditemukan" }, { status: 404 });
  }
  if (flag.type !== "EXPERIMENT") {
    return NextResponse.json({ error: "Variant hanya untuk flag bertipe EXPERIMENT" }, { status: 400 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const currentTotal = flag.variants.reduce((sum, v) => sum + v.trafficPercentage, 0);
  if (currentTotal + parsed.data.trafficPercentage > 100) {
    return NextResponse.json(
      { error: `Total alokasi traffic akan melebihi 100% (saat ini ${currentTotal}%)` },
      { status: 400 }
    );
  }

  const existing = flag.variants.find((v) => v.key === parsed.data.key);
  if (existing) {
    return NextResponse.json({ error: "Key variant sudah dipakai di flag ini" }, { status: 409 });
  }

  const variant = await prisma.variant.create({ data: { flagId: flag.id, ...parsed.data } });
  return NextResponse.json({ variant }, { status: 201 });
}
