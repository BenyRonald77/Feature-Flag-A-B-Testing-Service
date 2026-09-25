import "dotenv/config";
import { prisma } from "../src/lib/prisma";

const BASE_URL = "http://localhost:3000";
const FLAG_KEY = "verify-stats-flag";

async function evaluate(userId: string) {
  const res = await fetch(`${BASE_URL}/api/evaluate?flagKey=${FLAG_KEY}&userId=${userId}`);
  return res.json() as Promise<{ flagKey: string; enabled: boolean; variantKey: string | null }>;
}

async function convert(userId: string) {
  const res = await fetch(`${BASE_URL}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flagKey: FLAG_KEY, userId }),
  });
  return res.json();
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@flags.dev", password: "password123" }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("Login gagal, tidak ada cookie sesi");
  return setCookie.split(";")[0];
}

async function main() {
  console.log("=== Verifikasi Conversion Stats ===\n");

  await prisma.event.deleteMany({ where: { flag: { key: FLAG_KEY } } });
  await prisma.assignment.deleteMany({ where: { flag: { key: FLAG_KEY } } });
  await prisma.variant.deleteMany({ where: { flag: { key: FLAG_KEY } } });
  await prisma.flag.deleteMany({ where: { key: FLAG_KEY } });

  const flag = await prisma.flag.create({
    data: { key: FLAG_KEY, name: "Verify Stats Flag", type: "EXPERIMENT", enabled: true },
  });
  await prisma.variant.create({ data: { flagId: flag.id, key: "control", name: "Control", trafficPercentage: 50 } });
  await prisma.variant.create({ data: { flagId: flag.id, key: "treatment", name: "Treatment", trafficPercentage: 50 } });

  // Expose 200 user, catat siapa masuk variant mana (deterministik lewat hash, tapi kita baca dari respons)
  const userIds = Array.from({ length: 200 }, (_, i) => `verify-stats-user-${i}`);
  console.log(`Mengekspos ${userIds.length} user ke flag experiment...`);
  const exposures = await Promise.all(userIds.map(async (id) => ({ id, result: await evaluate(id) })));

  const controlUsers = exposures.filter((e) => e.result.variantKey === "control").map((e) => e.id);
  const treatmentUsers = exposures.filter((e) => e.result.variantKey === "treatment").map((e) => e.id);
  console.log(`  -> control: ${controlUsers.length} user, treatment: ${treatmentUsers.length} user`);

  // Dengan rasio konversi YANG DIKETAHUI: control 20%, treatment 50%
  const controlConvertCount = Math.floor(controlUsers.length * 0.2);
  const treatmentConvertCount = Math.floor(treatmentUsers.length * 0.5);
  const controlConverters = controlUsers.slice(0, controlConvertCount);
  const treatmentConverters = treatmentUsers.slice(0, treatmentConvertCount);

  console.log(`Mengirim konversi: ${controlConverters.length} dari control, ${treatmentConverters.length} dari treatment...`);
  await Promise.all([...controlConverters, ...treatmentConverters].map((id) => convert(id)));

  console.log("\nLogin sebagai admin untuk mengambil statistik...");
  const cookie = await login();
  const statsRes = await fetch(`${BASE_URL}/api/flags/${flag.id}/stats`, { headers: { Cookie: cookie } });
  const { stats } = (await statsRes.json()) as {
    stats: { variantKey: string; exposures: number; conversions: number; conversionRate: number }[];
  };

  console.log("\nHasil dari endpoint /stats:");
  console.table(stats);

  const controlStat = stats.find((s) => s.variantKey === "control");
  const treatmentStat = stats.find((s) => s.variantKey === "treatment");

  const controlExposureOk = controlStat?.exposures === controlUsers.length;
  const controlConversionOk = controlStat?.conversions === controlConverters.length;
  const treatmentExposureOk = treatmentStat?.exposures === treatmentUsers.length;
  const treatmentConversionOk = treatmentStat?.conversions === treatmentConverters.length;

  const expectedControlRate = controlUsers.length > 0 ? controlConverters.length / controlUsers.length : 0;
  const expectedTreatmentRate = treatmentUsers.length > 0 ? treatmentConverters.length / treatmentUsers.length : 0;
  const controlRateOk = Math.abs((controlStat?.conversionRate ?? -1) - expectedControlRate) < 1e-9;
  const treatmentRateOk = Math.abs((treatmentStat?.conversionRate ?? -1) - expectedTreatmentRate) < 1e-9;

  console.log(`\nExposure control cocok (${controlUsers.length})? ${controlExposureOk ? "YA" : "TIDAK"}`);
  console.log(`Konversi control cocok (${controlConverters.length})? ${controlConversionOk ? "YA" : "TIDAK"}`);
  console.log(`Exposure treatment cocok (${treatmentUsers.length})? ${treatmentExposureOk ? "YA" : "TIDAK"}`);
  console.log(`Konversi treatment cocok (${treatmentConverters.length})? ${treatmentConversionOk ? "YA" : "TIDAK"}`);
  console.log(`Conversion rate control cocok (${(expectedControlRate * 100).toFixed(2)}%)? ${controlRateOk ? "YA" : "TIDAK"}`);
  console.log(`Conversion rate treatment cocok (${(expectedTreatmentRate * 100).toFixed(2)}%)? ${treatmentRateOk ? "YA" : "TIDAK"}`);

  await prisma.event.deleteMany({ where: { flagId: flag.id } });
  await prisma.assignment.deleteMany({ where: { flagId: flag.id } });
  await prisma.variant.deleteMany({ where: { flagId: flag.id } });
  await prisma.flag.delete({ where: { id: flag.id } });

  const passed =
    controlExposureOk && controlConversionOk && treatmentExposureOk && treatmentConversionOk && controlRateOk && treatmentRateOk;
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
