import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { signToken, requireAuth, type AuthedRequest } from "../auth.js";
import { computeApproved, isAdminEmail, findApprovedByNameKey } from "../lib/approval.js";
import { nameKey } from "../lib/nameKey.js";

// Emailni qisman yashirish: "ilkhomjon2001@gmail.com" → "ilk***@gmail.com".
// Dublikat account xabari begonaga ko'rsatilishi mumkin — to'liq emailni oshkor qilmaymiz.
function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const keep = local.slice(0, Math.min(3, Math.max(1, local.length - 1)));
  return `${keep}***@${domain}`;
}

export const authRouter = Router();

const googleClient = new OAuth2Client(config.googleClientId);

function publicTeacher(t: { id: string; email: string; name: string; picture?: string | null; isAdmin: boolean; approved: boolean; canCreate?: boolean; password?: string | null; teacherRequestAt?: Date | null }) {
  return {
    id: t.id,
    email: t.email,
    name: t.name,
    picture: t.picture ?? null,
    isAdmin: t.isAdmin,
    isSuperAdmin: isAdminEmail(t.email), // ADMIN_EMAILS env'dagi = super admin (hamma narsa)
    approved: t.approved,
    canCreate: t.canCreate ?? false, // "slayd qilish" ruxsati
    hasPassword: !!t.password, // parol o'rnatilganmi (Sozlamalar UI uchun)
    teacherRequestPending: !!t.teacherRequestAt, // ustozlik so'rovi yuborilgan, admin hali ko'rmagan
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
    // Mavjud accountda DB'dagi ism ustun (teacher-request orqali to'g'rilangan bo'lishi mumkin —
    // Google'dagi eski ism uni qayta o'chirib yubormasin).
    const isAdmin = isAdminEmail(email) || teacher?.isAdmin === true;
    const effName = teacher?.name ?? name;
    let approved = await computeApproved(email, effName, teacher?.accessOverride);
    // Dublikatga qarshi: faqat YANGI avto-approve bloklanadi (allaqachon approved account demote bo'lmaydi)
    if (approved && !isAdmin && teacher?.approved !== true && teacher?.accessOverride !== true) {
      const dup = await findApprovedByNameKey(effName, teacher?.id);
      if (dup) approved = false; // /profile'ga tushadi, u yerdan so'rov yuborishi mumkin
    }
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
  // Bitta ustoz nomi bilan ikkinchi account ochishga yo'l qo'ymaymiz:
  // shu ism bilan tasdiqlangan account bo'lsa — ro'yxatdan o'tish bloklanadi.
  if (approved && !isAdmin) {
    const dup = await findApprovedByNameKey(name);
    if (dup) {
      res.status(409).json({
        error: `Bu ustoz nomi bilan account allaqachon ochilgan — siz oldin ${maskEmail(dup.email)} emaili orqali ro'yxatdan o'tgansiz. O'sha account bilan kiring yoki parolni unutgan bo'lsangiz admin bilan bog'laning.`,
      });
      return;
    }
  }
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
  let approved = await computeApproved(teacher.email, teacher.name, teacher.accessOverride);
  // Dublikatga qarshi: shu ism bilan boshqa tasdiqlangan account bo'lsa, yangi avto-approve bermaymiz
  if (approved && !isAdmin && teacher.approved !== true && teacher.accessOverride !== true) {
    const dup = await findApprovedByNameKey(teacher.name, teacher.id);
    if (dup) approved = false;
  }
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
    select: { id: true, email: true, name: true, picture: true, isAdmin: true, approved: true, canCreate: true, password: true, teacherRequestAt: true },
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

// Ustozlik uchun so'rov. Foydalanuvchi ism-familiyasini (jadvaldagi kabi) yuboradi:
// 1) ism roster'ga mos kelsa — darhol approved bo'ladi (adminni kutmaydi);
// 2) mos kelmasa — so'rov sifatida saqlanadi, admin panelda ko'rinadi.
const teacherRequestSchema = z.object({ name: z.string().trim().min(3) });

authRouter.post("/teacher-request", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = teacherRequestSchema.safeParse(req.body);
  const name = parsed.success ? parsed.data.name.replace(/\s+/g, " ") : "";
  if (!parsed.success || name.split(" ").length < 2) {
    res.status(400).json({ error: "Ism va familiyani to'liq kiriting (jadvaldagi bilan bir xil)" });
    return;
  }
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId } });
  if (!teacher) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  if (teacher.approved || teacher.isAdmin) {
    res.json({ teacher: publicTeacher(teacher) });
    return;
  }
  // Ismni yangilab, roster bo'yicha qayta tekshiramiz
  const approved = await computeApproved(teacher.email, name, teacher.accessOverride);
  // Bu ustoz nomi bilan tasdiqlangan account allaqachon bo'lsa — taqiq (dublikat account)
  if (approved) {
    const dup = await findApprovedByNameKey(name, teacher.id);
    if (dup) {
      res.status(409).json({
        error: `Bu ustoz nomi bilan account allaqachon ochilgan — siz oldin ${maskEmail(dup.email)} emaili orqali ro'yxatdan o'tgansiz. O'sha account bilan kiring; parolni unutgan bo'lsangiz admin bilan bog'laning.`,
      });
      return;
    }
  }
  const updated = await prisma.teacher.update({
    where: { id: teacher.id },
    data: approved
      ? { name, approved: true, teacherRequestAt: null, teacherRequestName: null }
      : { name, teacherRequestAt: new Date(), teacherRequestName: name },
  });
  res.json({ teacher: publicTeacher(updated) });
});

// O'quvchi shaxsiy natijalari: o'yinlarda o'z ismi bilan qatnashgan yozuvlar.
// GamePlayerRecord'da account bog'lanmagani uchun nickname'ni nameKey orqali moslashtiramiz.
authRouter.get("/my-results", requireAuth, async (req: AuthedRequest, res) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId }, select: { name: true } });
  if (!teacher) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  const myKey = nameKey(teacher.name);
  const records = await prisma.gamePlayerRecord.findMany({
    select: {
      id: true, nickname: true, score: true, correctCount: true, totalAnswered: true,
      game: { select: { title: true, mode: true, playedAt: true } },
    },
    orderBy: { game: { playedAt: "desc" } },
    take: 2000, // yetarli zaxira; nickname bo'yicha filtrlash JS'da
  });
  const results = records
    .filter((r) => nameKey(r.nickname) === myKey)
    .slice(0, 100)
    .map((r) => ({
      id: r.id,
      title: r.game.title,
      mode: r.game.mode,
      playedAt: r.game.playedAt,
      score: r.score,
      correctCount: r.correctCount,
      totalAnswered: r.totalAnswered,
    }));
  const totalScore = results.reduce((s, r) => s + r.score, 0);
  const totalCorrect = results.reduce((s, r) => s + r.correctCount, 0);
  const totalAnswered = results.reduce((s, r) => s + r.totalAnswered, 0);
  res.json({ results, totalScore, totalCorrect, totalAnswered });
});
