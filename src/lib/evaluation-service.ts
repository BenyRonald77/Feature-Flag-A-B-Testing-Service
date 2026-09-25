import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { hashBucket } from "./hash-bucket";

export interface EvaluationResult {
  flagKey: string;
  enabled: boolean;
  variantKey: string | null;
}

async function pickVariantForUser(
  flagId: string,
  flagKey: string,
  userId: string,
  variants: { id: string; key: string; trafficPercentage: number }[]
) {
  // Assignment STICKY: kalau sudah pernah di-assign, selalu pakai yang lama -
  // ini yang menjamin konsistensi meski alokasi traffic diubah admin nanti.
  const existing = await prisma.assignment.findUnique({
    where: { flagId_userId: { flagId, userId } },
    include: { variant: true },
  });
  if (existing) return existing.variant;

  const bucket = hashBucket(flagKey, userId);
  let cumulative = 0;
  let chosen = variants[variants.length - 1];
  for (const v of variants) {
    cumulative += v.trafficPercentage;
    if (bucket < cumulative) {
      chosen = v;
      break;
    }
  }

  try {
    await prisma.assignment.create({
      data: { flagId, userId, variantId: chosen.id },
    });
  } catch (error) {
    // Race: proses lain sudah membuat assignment untuk user ini duluan -
    // pakai yang sudah tersimpan (bukan hasil hitung kita) agar tetap konsisten.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raceWinner = await prisma.assignment.findUniqueOrThrow({
        where: { flagId_userId: { flagId, userId } },
        include: { variant: true },
      });
      return raceWinner.variant;
    }
    throw error;
  }

  return chosen;
}

export async function evaluateFlag(flagKey: string, userId: string): Promise<EvaluationResult> {
  const flag = await prisma.flag.findUnique({
    where: { key: flagKey },
    include: { variants: true },
  });

  if (!flag || !flag.enabled) {
    return { flagKey, enabled: false, variantKey: null };
  }

  if (flag.type === "EXPERIMENT" && flag.variants.length > 0) {
    const variant = await pickVariantForUser(flag.id, flag.key, userId, flag.variants);
    await prisma.event.create({
      data: { flagId: flag.id, userId, variantKey: variant.key, variantId: variant.id, type: "EXPOSURE" },
    });
    return { flagKey, enabled: true, variantKey: variant.key };
  }

  // Flag BOOLEAN: rollout bertahap - dihitung LIVE setiap kali (tanpa
  // disimpan), sehingga otomatis monoton saat rolloutPercentage naik.
  const bucket = hashBucket(flag.key, userId);
  const enabled = bucket < flag.rolloutPercentage;
  const variantKey = enabled ? "enabled" : "disabled";

  await prisma.event.create({
    data: { flagId: flag.id, userId, variantKey, type: "EXPOSURE" },
  });

  return { flagKey, enabled, variantKey };
}

export async function recordConversion(flagKey: string, userId: string) {
  const flag = await prisma.flag.findUnique({ where: { key: flagKey } });
  if (!flag) return null;

  let variantKey: string;
  let variantId: string | null = null;

  if (flag.type === "EXPERIMENT") {
    const assignment = await prisma.assignment.findUnique({
      where: { flagId_userId: { flagId: flag.id, userId } },
      include: { variant: true },
    });
    if (!assignment) return null; // belum pernah exposed, tidak ada variant untuk dikaitkan
    variantKey = assignment.variant.key;
    variantId = assignment.variantId;
  } else {
    const bucket = hashBucket(flag.key, userId);
    variantKey = bucket < flag.rolloutPercentage ? "enabled" : "disabled";
  }

  return prisma.event.create({
    data: { flagId: flag.id, userId, variantKey, variantId, type: "CONVERSION" },
  });
}
