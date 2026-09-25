import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.admin.upsert({
    where: { email: "admin@flags.dev" },
    update: {},
    create: { name: "Admin Produk", email: "admin@flags.dev", passwordHash },
  });

  const rolloutFlag = await prisma.flag.upsert({
    where: { key: "new-checkout" },
    update: {},
    create: {
      key: "new-checkout",
      name: "Checkout Baru",
      description: "Alur checkout yang didesain ulang",
      type: "BOOLEAN",
      enabled: true,
      rolloutPercentage: 10,
    },
  });

  const expFlag = await prisma.flag.upsert({
    where: { key: "homepage-hero" },
    update: {},
    create: {
      key: "homepage-hero",
      name: "Hero Homepage",
      description: "Eksperimen desain hero section homepage",
      type: "EXPERIMENT",
      enabled: true,
    },
  });

  const existingVariants = await prisma.variant.findMany({ where: { flagId: expFlag.id } });
  if (existingVariants.length === 0) {
    await prisma.variant.create({ data: { flagId: expFlag.id, key: "control", name: "Kontrol (lama)", trafficPercentage: 50 } });
    await prisma.variant.create({ data: { flagId: expFlag.id, key: "treatment", name: "Baru (bold CTA)", trafficPercentage: 50 } });
  }

  console.log("Seed selesai.");
  console.log("Login admin: admin@flags.dev / password123");
  console.log(`Flag rollout: ${rolloutFlag.key} (10%)`);
  console.log(`Flag eksperimen: ${expFlag.key} (control/treatment 50/50)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
