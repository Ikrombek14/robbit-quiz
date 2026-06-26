import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { signToken, requireAuth, type AuthedRequest } from "../auth.js";

export const authRouter = Router();

const googleClient = new OAuth2Client(config.googleClientId);

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

    const isAdmin = config.adminEmails.includes(email);
    let teacher = await prisma.teacher.findUnique({ where: { email } });
    if (!teacher) {
      teacher = await prisma.teacher.create({ data: { email, name, picture, password: null, isAdmin } });
    } else {
      const updates: Record<string, unknown> = {};
      if (picture && teacher.picture !== picture) updates.picture = picture;
      if (teacher.isAdmin !== isAdmin) updates.isAdmin = isAdmin;
      if (Object.keys(updates).length) {
        teacher = await prisma.teacher.update({ where: { id: teacher.id }, data: updates });
      }
    }
    const token = signToken(teacher.id);
    res.json({ token, teacher: { id: teacher.id, email: teacher.email, name: teacher.name, picture: teacher.picture, isAdmin: teacher.isAdmin } });
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
  const isAdmin = config.adminEmails.includes(email);
  const teacher = await prisma.teacher.create({ data: { email, password: hash, name, isAdmin } });
  const token = signToken(teacher.id);
  res.json({ token, teacher: { id: teacher.id, email, name, isAdmin: teacher.isAdmin } });
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
  // isAdmin ni ham yangilash (email admin ro'yxatida bo'lsa)
  const isAdmin = config.adminEmails.includes(teacher.email);
  if (teacher.isAdmin !== isAdmin) {
    await prisma.teacher.update({ where: { id: teacher.id }, data: { isAdmin } });
  }
  const token = signToken(teacher.id);
  res.json({ token, teacher: { id: teacher.id, email: teacher.email, name: teacher.name, isAdmin } });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const teacher = await prisma.teacher.findUnique({
    where: { id: req.teacherId },
    select: { id: true, email: true, name: true, picture: true, isAdmin: true },
  });
  res.json({ teacher });
});
