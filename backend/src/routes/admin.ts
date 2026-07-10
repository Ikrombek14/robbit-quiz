import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "../auth.js";
import { computeApproved, isAdminEmail, findApprovedByNameKey } from "../lib/approval.js";

// Foydalanuvchilar (saytga kirgan ustoz accountlari) ustidan admin nazorati.
// Faqat admin: ustoz huquqini (approved) berish/olib tashlash va admin huquqini boshqarish.
export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

function publicUser(t: {
  id: string;
  email: string;
  name: string;
  picture: string | null;
  isAdmin: boolean;
  approved: boolean;
  canCreate: boolean;
  accessOverride: boolean | null;
  teacherRequestAt?: Date | null;
  teacherRequestName?: string | null;
  createdAt: Date;
  _count?: { quizzes: number };
}) {
  return {
    id: t.id,
    email: t.email,
    name: t.name,
    picture: t.picture,
    isAdmin: t.isAdmin,
    approved: t.approved,
    canCreate: t.canCreate, // "slayd qilish" ruxsati
    accessOverride: t.accessOverride,
    teacherRequestAt: t.teacherRequestAt ?? null, // ustozlik so'rovi (kutilayotgan)
    teacherRequestName: t.teacherRequestName ?? null,
    envAdmin: isAdminEmail(t.email), // env ADMIN_EMAILS'dagi = super admin — huquqini olib bo'lmaydi
    quizCount: t._count?.quizzes ?? 0,
    createdAt: t.createdAt,
  };
}

// So'rovchi super admin'mi? (ADMIN_EMAILS env'dagi)
async function isSuperAdminReq(teacherId?: string): Promise<boolean> {
  if (!teacherId) return false;
  const t = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { email: true } });
  return !!t && isAdminEmail(t.email);
}

// ---- Ro'yxat ----
// Default: o'quvchilar (huquqsiz, so'rovsiz oddiy accountlar) ko'rsatilmaydi —
// faqat ustozlar, adminlar, ruxsat berilganlar va ustozlik so'rovi yuborganlar.
// ?all=1 bo'lsa hamma account qaytadi.
adminRouter.get("/users", async (req, res) => {
  const showAll = req.query.all === "1";
  const users = await prisma.teacher.findMany({
    where: showAll
      ? undefined
      : {
          OR: [
            { approved: true },
            { isAdmin: true },
            { canCreate: true },
            { accessOverride: { not: null } },
            { teacherRequestAt: { not: null } },
          ],
        },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, email: true, name: true, picture: true, isAdmin: true,
      approved: true, canCreate: true, accessOverride: true, createdAt: true,
      teacherRequestAt: true, teacherRequestName: true,
      _count: { select: { quizzes: true } },
    },
  });
  res.json({ users: users.map(publicUser) });
});

// ---- Ustozlik so'rovini hal qilish (har qanday admin) ----
// approve=true: ustoz huquqi beriladi (accessOverride=true), so'rov yopiladi.
// approve=false: so'rov rad etiladi, foydalanuvchi o'quvchi bo'lib qoladi.
const requestSchema = z.object({ approve: z.boolean() });
adminRouter.post("/users/:id/teacher-request", async (req: AuthedRequest, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Noto'g'ri so'rov" });
    return;
  }
  const id = String(req.params.id);
  const target = await prisma.teacher.findUnique({ where: { id } });
  if (!target) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  const updated = await prisma.teacher.update({
    where: { id },
    data: parsed.data.approve
      ? { accessOverride: true, approved: true, teacherRequestAt: null, teacherRequestName: null }
      : { teacherRequestAt: null, teacherRequestName: null },
    select: {
      id: true, email: true, name: true, picture: true, isAdmin: true,
      approved: true, canCreate: true, accessOverride: true, createdAt: true,
      teacherRequestAt: true, teacherRequestName: true,
      _count: { select: { quizzes: true } },
    },
  });
  res.json({ user: publicUser(updated) });
});

// ---- Foydalanuvchini ro'yxatdagi ustozga biriktirish (har qanday admin) ----
// Ism imlosi farq qilganda (o'/g' belgilari, bitta harf xatosi) roster bilan avtomatik
// moslik ishlamaydi va ustoz statistikasi ko'rinmaydi. Biriktirish account ismini
// ro'yxatdagi ANIQ imloga tenglashtiradi — butun tizim (approved, statistika, tahlil)
// nameKey orqali ishlagani uchun hammasi o'z-o'zidan to'g'ri bog'lanadi.
const bindSchema = z.object({ rosterId: z.string().min(1) });
adminRouter.post("/users/:id/bind-roster", async (req: AuthedRequest, res) => {
  const parsed = bindSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Noto'g'ri so'rov" });
    return;
  }
  const id = String(req.params.id);
  const target = await prisma.teacher.findUnique({ where: { id } });
  if (!target) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  const roster = await prisma.rosterTeacher.findUnique({ where: { id: parsed.data.rosterId } });
  if (!roster) {
    res.status(404).json({ error: "Ro'yxatdagi ustoz topilmadi" });
    return;
  }
  // Bu ism bilan allaqachon tasdiqlangan BOSHQA account bo'lsa — bloklaymiz
  // (bitta ustoz nomini ikki account egallamasin)
  const taken = await findApprovedByNameKey(roster.name, id);
  if (taken) {
    res.status(409).json({ error: `"${roster.name}" allaqachon boshqa accountga (${taken.email}) biriktirilgan` });
    return;
  }
  const updated = await prisma.teacher.update({
    where: { id },
    data: {
      name: roster.name, // roster imlosi bilan almashtiriladi — moslikning kaliti shu
      approved: await computeApproved(target.email, roster.name, target.accessOverride),
      // Ochiq ustozlik so'rovi bo'lsa, biriktirish uni ham yopadi
      teacherRequestAt: null,
      teacherRequestName: null,
    },
    select: {
      id: true, email: true, name: true, picture: true, isAdmin: true,
      approved: true, canCreate: true, accessOverride: true, createdAt: true,
      teacherRequestAt: true, teacherRequestName: true,
      _count: { select: { quizzes: true } },
    },
  });
  res.json({ user: publicUser(updated) });
});

const patchSchema = z
  .object({
    // ustoz huquqi: true = ber, false = olib tashla, null = avtomatik (roster bo'yicha)
    accessOverride: z.union([z.boolean(), z.null()]).optional(),
    isAdmin: z.boolean().optional(),
    canCreate: z.boolean().optional(), // "slayd qilish" ruxsati
  })
  .refine((d) => d.accessOverride !== undefined || d.isAdmin !== undefined || d.canCreate !== undefined, {
    message: "Hech qanday o'zgarish yuborilmadi",
  });

// ---- Ustoz/admin huquqini o'zgartirish ----
adminRouter.patch("/users/:id", async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Noto'g'ri so'rov" });
    return;
  }
  const id = String(req.params.id);
  const target = await prisma.teacher.findUnique({ where: { id } });
  if (!target) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }

  const data: { accessOverride?: boolean | null; approved?: boolean; isAdmin?: boolean; canCreate?: boolean } = {};

  // "Slayd qilish" ruxsati — har qanday admin (super yoki oddiy) bera/olib tashlay oladi
  if (parsed.data.canCreate !== undefined) {
    data.canCreate = parsed.data.canCreate;
  }

  // Quyidagilar (ustoz huquqi + admin huquqi) FAQAT super admin uchun
  const wantsSuperOnly = parsed.data.accessOverride !== undefined || parsed.data.isAdmin !== undefined;
  if (wantsSuperOnly && !(await isSuperAdminReq(req.teacherId))) {
    res.status(403).json({ error: "Ustoz/admin huquqini faqat super admin o'zgartira oladi" });
    return;
  }

  if (parsed.data.accessOverride !== undefined) {
    const override = parsed.data.accessOverride;
    data.accessOverride = override;
    // approved'ni darhol qayta hisoblaymiz (qaytadan kirishni kutmasdan)
    data.approved = await computeApproved(target.email, target.name, override);
  }

  if (parsed.data.isAdmin !== undefined) {
    // O'zining admin huquqini olib tashlay olmaydi (lockout xavfi)
    if (parsed.data.isAdmin === false && id === req.teacherId) {
      res.status(400).json({ error: "O'zingizning admin huquqingizni olib tashlay olmaysiz" });
      return;
    }
    // env ADMIN_EMAILS'dagi admin huquqini DB orqali olib bo'lmaydi (kirishda qayta tiklanadi)
    if (parsed.data.isAdmin === false && isAdminEmail(target.email)) {
      res.status(400).json({ error: "Bu account ADMIN_EMAILS ro'yxatida — huquqini bu yerdan olib bo'lmaydi" });
      return;
    }
    data.isAdmin = parsed.data.isAdmin;
  }

  const updated = await prisma.teacher.update({
    where: { id },
    data,
    select: {
      id: true, email: true, name: true, picture: true, isAdmin: true,
      approved: true, canCreate: true, accessOverride: true, createdAt: true,
      _count: { select: { quizzes: true } },
    },
  });
  res.json({ user: publicUser(updated) });
});

// ---- Foydalanuvchi parolini tiklash (admin) ----
// Foydalanuvchi parolni unutsa va Google bilan ham kira olmasa, admin yangi parol
// o'rnatib beradi. Foydalanuvchi keyin Sozlamalar orqali o'zgartirishi mumkin.
const resetPwSchema = z.object({ password: z.string().min(6) });
adminRouter.post("/users/:id/password", async (req: AuthedRequest, res) => {
  // Parol tiklash — faqat super admin
  if (!(await isSuperAdminReq(req.teacherId))) {
    res.status(403).json({ error: "Parol tiklash faqat super admin uchun" });
    return;
  }
  const parsed = resetPwSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Parol kamida 6 belgi bo'lishi kerak" });
    return;
  }
  const id = String(req.params.id);
  const target = await prisma.teacher.findUnique({ where: { id } });
  if (!target) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  const hash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.teacher.update({ where: { id }, data: { password: hash } });
  res.json({ ok: true });
});

// ---- Foydalanuvchini o'chirish (faqat super admin) ----
// Account bilan birga loyihalari va papkalari ham o'chadi (FK cascade).
// O'ynalgan o'yin hisobotlari (GameRecord) saqlanib qoladi.
adminRouter.delete("/users/:id", async (req: AuthedRequest, res) => {
  if (!(await isSuperAdminReq(req.teacherId))) {
    res.status(403).json({ error: "Foydalanuvchini o'chirish faqat super admin uchun" });
    return;
  }
  const id = String(req.params.id);
  if (id === req.teacherId) {
    res.status(400).json({ error: "O'zingizni o'chira olmaysiz" });
    return;
  }
  const target = await prisma.teacher.findUnique({ where: { id }, select: { email: true } });
  if (!target) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  if (isAdminEmail(target.email)) {
    res.status(400).json({ error: "ADMIN_EMAILS ro'yxatidagi accountni o'chirib bo'lmaydi" });
    return;
  }
  await prisma.teacher.delete({ where: { id } });
  res.json({ ok: true });
});
