// Admin akkaunt yaratish (deploy paytida bir marta ishga tushiriladi)
// Foydalanish: node prisma/seed-admin.mjs <email> <parol>
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Foydalanish: node prisma/seed-admin.mjs <email> <parol>");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const bcrypt = await import("bcryptjs");

const prisma = new PrismaClient();

try {
  const hash = await bcrypt.hash(password, 10);
  const existing = await prisma.teacher.findUnique({ where: { email } });

  if (existing) {
    await prisma.teacher.update({
      where: { email },
      data: { isAdmin: true, approved: true, password: hash },
    });
    console.log(`✅ Admin yangilandi: ${email}`);
  } else {
    await prisma.teacher.create({
      data: {
        email,
        name: "Admin",
        password: hash,
        isAdmin: true,
        approved: true,
      },
    });
    console.log(`✅ Admin yaratildi: ${email}`);
  }
} finally {
  await prisma.$disconnect();
}
