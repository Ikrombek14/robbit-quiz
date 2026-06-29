import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { signToken, requireAuth, type AuthedRequest } from "../auth.js";
import { computeApproved, isAdminEmail } from "../lib/approval.js";

export const authRouter = Router();

const googleClient = new OAuth2Client(config.googleClientId);

function publicTeacher(t: { id: string; email: string; name: string; picture?: string | null; isAdmin: boolean; approved: boolean; password?: string | null }) {
  return {
    id: t.id,
    email: t.email,
    name: t.name,
    picture: t.picture ?? null,
    isAdmin: t.isAdmin,
    approved: t.approved,
    hasPassword: !!t.password, // parol o'rnatilganmi (Sozlamalar UI uchun)
  };
}

// Google email bilan kirish: frontend ID token (credential) yuboradi
authRouter.post("/google", async (req, res) => {
  const credential = (req.body?.credential ?? "") as string;
  if (!credential) {
    res.status(400).json({ error: "Google token yuborilmadi" });
    return;
  }
  if (!config.googleClientId) {
    res.status(500).json({ error: "Server'da GOOGLE_CLIENT_ID sozlanmagan" });
    return;
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: config.googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      res.status(401).json({ error: "Google token yaroqsiz" });
      return;
    }
    const email = payload.email;
    const name = payload.name ?? email.split("@")[0];
    const picture = payload.picture ?? null;

    let teacher = await prisma.teacher.findUnique({ where: { email } });
    // Admin huquqi: env admin yoki DB'da qo'lda berilgan (qaytadan kirishda yo'qolmasin).
    // Ustoz huquqi: accessOverride'ni hisobga olib hisoblanadi.
    const isAdmin = isAdminEmail(email) || teacher?.isAdmin === true;
    const approved = await computeApproved(email, name, teacher?.accessOverride);
    if (!teacher) {
      teacher = await prisma.teacher.create({ data: { email, name, picture, password: null, isAdmin, approved } });
    } else {
      const updates: Record<string, unknown> = {};
      if (picture && teacher.picture !== picture) updates.picture = picture;
      if (teacher.isAdmin !== isAdmin) updates.isAdmin = isAdmin;
      if (teacher.approved !== approved) updates.approved = approved;
      if (Object.keys(updates).length) {
        teacher = await prisma.teacher.update({ where: { id: teacher.id }, data: updates });
      }
    }
    const token = signToken(teacher.id);
    res.json({ token, teacher: publicTeacher(teacher) });
  } catch {
    res.status(401).json({ error: "Google token tekshirilmadi" });
  }
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email, parol (kamida 6 belgi) va ism kerak" });
    return;
  }
  const { email, password, name } = parsed.data;
  const exists = await prisma.teacher.findUnique({ where: { email } });
  if (exists) {
    res.status(409).json({ error: "Bu email allaqachon ro'yxatdan o'tgan" });
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  const isAdmin = isAdminEmail(email);
  const approved = await computeApproved(email, name, null);
  const teacher = await prisma.teacher.create({ data: { email, password: hash, name, isAdmin, approved } });
  const token = signToken(teacher.id);
  res.json({ token, teacher: publicTeacher(teacher) });
});

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Email va parol kerak" });
    return;
  }
  const { email, password } = parsed.data;
  const teacher = await prisma.teacher.findUnique({ where: { email } });
  if (!teacher || !teacher.password || !(await bcrypt.compare(password, teacher.password))) {
    res.status(401).json({ error: "Email yoki parol xato" });
    return;
  }
  // isAdmin va approved ni qayta hisoblab yangilaymiz.
  // env admin yoki DB'da qo'lda berilgan admin huquqi saqlanadi; ustoz huquqi override'ni hisobga oladi.
  const isAdmin = isAdminEmail(teacher.email) || teacher.isAdmin === true;
  const approved = await computeApproved(teacher.email, teacher.name, teacher.accessOverride);
  let t = teacher;
  if (teacher.isAdmin !== isAdmin || teacher.approved !== approved) {
    t = await prisma.teacher.update({ where: { id: teacher.id }, data: { isAdmin, approved } });
  }
  const token = signToken(t.id);
  res.json({ token, teacher: publicTeacher(t) });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const teacher = await prisma.teacher.findUnique({
    where: { id: req.teacherId },
    select: { id: true, email: true, name: true, picture: true, isAdmin: true, approved: true, password: true },
  });
  res.json({ teacher: teacher ? publicTeacher(teacher) : null });
});

// Parolni o'rnatish / o'zgartirish (o'zining accounti uchun).
// Parol mavjud bo'lsa — joriy parolni tekshiramiz. Google bilan kirgan (parolsiz)
// foydalanuvchi joriy parolsiz yangi parol o'rnatishi mumkin — shu "parolni unutdim"
// holatini qoplaydi: Google bilan kiradi, keyin shu yerda yangi parol o'rnatadi.
const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6),
});

authRouter.post("/password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Yangi parol kamida 6 belgi bo'lishi kerak" });
    return;
  }
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId } });
  if (!teacher) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  if (teacher.password) {
    const ok = parsed.data.currentPassword && (await bcrypt.compare(parsed.data.currentPassword, teacher.password));
    if (!ok) {
      res.status(400).json({ error: "Joriy parol noto'g'ri" });
      return;
    }
  }
  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.teacher.update({ where: { id: teacher.id }, data: { password: hash } });
  res.json({ ok: true });
});
