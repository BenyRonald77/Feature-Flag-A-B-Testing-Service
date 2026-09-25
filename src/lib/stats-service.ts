import { prisma } from "./prisma";

export interface VariantStats {
  variantKey: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
}

export async function getConversionStats(flagId: string): Promise<VariantStats[]> {
  const rows = await prisma.event.groupBy({
    by: ["variantKey", "type"],
    where: { flagId },
    _count: { _all: true },
  });

  const byVariant = new Map<string, { exposures: number; conversions: number }>();
  for (const row of rows) {
    const entry = byVariant.get(row.variantKey) ?? { exposures: 0, conversions: 0 };
    if (row.type === "EXPOSURE") entry.exposures = row._count._all;
    if (row.type === "CONVERSION") entry.conversions = row._count._all;
    byVariant.set(row.variantKey, entry);
  }

  return Array.from(byVariant.entries())
    .map(([variantKey, { exposures, conversions }]) => ({
      variantKey,
      exposures,
      conversions,
      conversionRate: exposures > 0 ? conversions / exposures : 0,
    }))
    .sort((a, b) => a.variantKey.localeCompare(b.variantKey));
}
