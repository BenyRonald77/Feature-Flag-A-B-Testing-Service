import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const BASE_URL = "http://localhost:3000";
const FLAG_KEY = "verify-rollout-flag";
const USER_COUNT = 1000;

async function evaluate(userId: string) {
  const res = await fetch(`${BASE_URL}/api/evaluate?flagKey=${FLAG_KEY}&userId=${userId}`);
  return res.json() as Promise<{ flagKey: string; enabled: boolean; variantKey: string | null }>;
}

async function setRollout(percentage: number) {
  await prisma.flag.update({ where: { key: FLAG_KEY }, data: { rolloutPercentage: percentage } });
}

async function main() {
  console.log("=== Verifikasi Gradual Rollout (BOOLEAN flag, live hash) ===\n");

  // Setup: buat flag BOOLEAN baru khusus verifikasi
  await prisma.event.deleteMany({ where: { flag: { key: FLAG_KEY } } });
  await prisma.flag.deleteMany({ where: { key: FLAG_KEY } });
  await prisma.flag.create({
    data: {
      key: FLAG_KEY,
      name: "Verify Rollout Flag",
      type: "BOOLEAN",
      enabled: true,
      rolloutPercentage: 10,
    },
  });

  const userIds = Array.from({ length: USER_COUNT }, (_, i) => `verify-user-${i}`);

  // Tahap 1: rollout 10%, cek distribusi mendekati 10%
  console.log(`Tahap 1: rolloutPercentage = 10%, mengevaluasi ${USER_COUNT} user...`);
  const results10 = await Promise.all(userIds.map((id) => evaluate(id)));
  const enabledCount10 = results10.filter((r) => r.enabled).length;
  const pct10 = (enabledCount10 / USER_COUNT) * 100;
  console.log(`  -> ${enabledCount10}/${USER_COUNT} user enabled (${pct10.toFixed(1)}%)`);

  const withinTolerance10 = Math.abs(pct10 - 10) <= 3;
  console.log(`  -> Dalam toleransi ±3% dari target 10%? ${withinTolerance10 ? "YA" : "TIDAK"}`);

  // Tahap 2: naikkan rollout ke 50%, pastikan SEMUA user yang enabled di 10% tetap enabled (monoton)
  console.log(`\nTahap 2: menaikkan rolloutPercentage ke 50%, evaluasi ulang ${USER_COUNT} user...`);
  await setRollout(50);
  const results50 = await Promise.all(userIds.map((id) => evaluate(id)));
  const enabledCount50 = results50.filter((r) => r.enabled).length;
  const pct50 = (enabledCount50 / USER_COUNT) * 100;
  console.log(`  -> ${enabledCount50}/${USER_COUNT} user enabled (${pct50.toFixed(1)}%)`);

  let monotonicityViolations = 0;
  userIds.forEach((id, i) => {
    const wasEnabled = results10[i].enabled;
    const isEnabledNow = results50[i].enabled;
    if (wasEnabled && !isEnabledNow) monotonicityViolations++;
  });
  console.log(`  -> Pelanggaran monotonicity (user enabled di 10% tapi disabled di 50%): ${monotonicityViolations}`);

  const withinTolerance50 = Math.abs(pct50 - 50) <= 3;
  console.log(`  -> Dalam toleransi ±3% dari target 50%? ${withinTolerance50 ? "YA" : "TIDAK"}`);

  // Cleanup
  await prisma.event.deleteMany({ where: { flag: { key: FLAG_KEY } } });
  await prisma.flag.deleteMany({ where: { key: FLAG_KEY } });

  const passed = withinTolerance10 && withinTolerance50 && monotonicityViolations === 0;
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
