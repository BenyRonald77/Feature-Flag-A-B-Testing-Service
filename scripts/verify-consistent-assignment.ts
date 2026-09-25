import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const BASE_URL = "http://localhost:3000";
const FLAG_KEY = "verify-experiment-flag";
const USER_ID = "verify-sticky-user";

async function evaluate(userId: string) {
  const res = await fetch(`${BASE_URL}/api/evaluate?flagKey=${FLAG_KEY}&userId=${userId}`);
  return res.json() as Promise<{ flagKey: string; enabled: boolean; variantKey: string | null }>;
}

async function main() {
  console.log("=== Verifikasi Consistent Assignment (EXPERIMENT flag, sticky) ===\n");

  await prisma.event.deleteMany({ where: { flag: { key: FLAG_KEY } } });
  await prisma.assignment.deleteMany({ where: { flag: { key: FLAG_KEY } } });
  await prisma.variant.deleteMany({ where: { flag: { key: FLAG_KEY } } });
  await prisma.flag.deleteMany({ where: { key: FLAG_KEY } });

  const flag = await prisma.flag.create({
    data: { key: FLAG_KEY, name: "Verify Experiment Flag", type: "EXPERIMENT", enabled: true },
  });
  await prisma.variant.create({
    data: { flagId: flag.id, key: "a", name: "Variant A", trafficPercentage: 50 },
  });
  await prisma.variant.create({
    data: { flagId: flag.id, key: "b", name: "Variant B", trafficPercentage: 50 },
  });

  console.log(`Mengevaluasi user "${USER_ID}" sebanyak 20 kali berturut-turut...`);
  const results = [];
  for (let i = 0; i < 20; i++) {
    results.push(await evaluate(USER_ID));
  }
  const distinctVariants = new Set(results.map((r) => r.variantKey));
  console.log(`  -> Variant yang didapat: ${[...distinctVariants].join(", ")}`);
  const stableBeforeChange = distinctVariants.size === 1;
  console.log(`  -> Konsisten (selalu variant yang sama)? ${stableBeforeChange ? "YA" : "TIDAK"}`);

  const assignedVariant = results[0].variantKey;
  if (!assignedVariant) throw new Error("Variant tidak terdefinisi, pastikan flag experiment aktif");

  console.log(`\nAdmin mengubah alokasi traffic (variant "${assignedVariant}" diturunkan drastis)...`);
  const otherKey = assignedVariant === "a" ? "b" : "a";
  await prisma.variant.updateMany({ where: { flagId: flag.id, key: assignedVariant }, data: { trafficPercentage: 1 } });
  await prisma.variant.updateMany({ where: { flagId: flag.id, key: otherKey }, data: { trafficPercentage: 99 } });

  console.log(`Mengevaluasi ulang user "${USER_ID}" sebanyak 10 kali setelah perubahan alokasi...`);
  const resultsAfter = [];
  for (let i = 0; i < 10; i++) {
    resultsAfter.push(await evaluate(USER_ID));
  }
  const distinctAfter = new Set(resultsAfter.map((r) => r.variantKey));
  console.log(`  -> Variant setelah perubahan alokasi: ${[...distinctAfter].join(", ")}`);
  const stickyAfterChange = distinctAfter.size === 1 && [...distinctAfter][0] === assignedVariant;
  console.log(`  -> Tetap variant yang sama meski alokasi berubah (sticky)? ${stickyAfterChange ? "YA" : "TIDAK"}`);

  // Verifikasi juga: user BARU setelah perubahan alokasi harus mengikuti alokasi baru secara statistik
  console.log(`\nMengevaluasi 500 user BARU setelah perubahan alokasi (harus ikut proporsi baru: 99%/1%)...`);
  const newUserIds = Array.from({ length: 500 }, (_, i) => `verify-new-user-${i}`);
  const newResults = await Promise.all(newUserIds.map((id) => evaluate(id)));
  const otherKeyCount = newResults.filter((r) => r.variantKey === otherKey).length;
  const otherKeyPct = (otherKeyCount / 500) * 100;
  console.log(`  -> ${otherKeyCount}/500 (${otherKeyPct.toFixed(1)}%) mendapat variant "${otherKey}" (target ~99%)`);
  const newUsersFollowNewAllocation = otherKeyPct >= 90;

  await prisma.event.deleteMany({ where: { flagId: flag.id } });
  await prisma.assignment.deleteMany({ where: { flagId: flag.id } });
  await prisma.variant.deleteMany({ where: { flagId: flag.id } });
  await prisma.flag.delete({ where: { id: flag.id } });

  const passed = stableBeforeChange && stickyAfterChange && newUsersFollowNewAllocation;
  console.log(`\n=== HASIL: ${passed ? "LULUS" : "GAGAL"} ===`);
  if (!passed) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
