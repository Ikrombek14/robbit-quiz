import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "../auth.js";
import { computeApproved, isAdminEmail } from "../lib/approval.js";

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
  accessOverride: boolean | null;
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
    accessOverride: t.accessOverride,
    envAdmin: isAdminEmail(t.email), // env ADMIN_EMAILS'dagi admin — huquqini olib bo'lmaydi
    quizCount: t._count?.quizzes ?? 0,
    createdAt: t.createdAt,
  };
}

// ---- Ro'yxat ----
adminRouter.get("/users", async (_req, res) => {
  const users = await prisma.teacher.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, email: true, name: true, picture: true, isAdmin: true,
      approved: true, accessOverride: true, createdAt: true,
      _count: { select: { quizzes: true } },
    },
  });
  res.json({ users: users.map(publicUser) });
});

const patchSchema = z
  .object({
    // ustoz huquqi: true = ber, false = olib tashla, null = avtomatik (roster bo'yicha)
    accessOverride: z.union([z.boolean(), z.null()]).optional(),
    isAdmin: z.boolean().optional(),
  })
  .refine((d) => d.accessOverride !== undefined || d.isAdmin !== undefined, {
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

  const data: { accessOverride?: boolean | null; approved?: boolean; isAdmin?: boolean } = {};

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
      approved: true, accessOverride: true, createdAt: true,
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
