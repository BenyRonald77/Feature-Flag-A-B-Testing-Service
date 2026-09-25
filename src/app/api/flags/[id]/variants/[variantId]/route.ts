import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

const schema = z.object({ trafficPercentage: z.number().int().min(0).max(100) });

export async function PATCH(request: NextRequest, { params }: { params: { id: string; variantId: string } }) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Data tidak valid" }, { status: 400 });
  }

  const variants = await prisma.variant.findMany({ where: { flagId: params.id } });
  const otherTotal = variants.filter((v) => v.id !== params.variantId).reduce((sum, v) => sum + v.trafficPercentage, 0);
  if (otherTotal + parsed.data.trafficPercentage > 100) {
    return NextResponse.json(
      { error: `Total alokasi traffic akan melebihi 100% (variant lain sudah ${otherTotal}%)` },
      { status: 400 }
    );
  }

  const variant = await prisma.variant.update({
    where: { id: params.variantId },
    data: { trafficPercentage: parsed.data.trafficPercentage },
  });

  return NextResponse.json({ variant });
}
