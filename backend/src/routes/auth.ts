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

    let teacher = await prisma.teacher.findUnique({ where: { email } });
    if (!teacher) {
      teacher = await prisma.teacher.create({ data: { email, name, picture, password: null } });
    } else if (picture && teacher.picture !== picture) {
      teacher = await prisma.teacher.update({ where: { id: teacher.id }, data: { picture } });
    }
    const token = signToken(teacher.id);
    res.json({ token, teacher: { id: teacher.id, email: teacher.email, name: teacher.name, picture: teacher.picture } });
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
  const teacher = await prisma.teacher.create({ data: { email, password: hash, name } });
  const token = signToken(teacher.id);
  res.json({ token, teacher: { id: teacher.id, email, name } });
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
  const token = signToken(teacher.id);
  res.json({ token, teacher: { id: teacher.id, email: teacher.email, name: teacher.name } });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const teacher = await prisma.teacher.findUnique({
    where: { id: req.teacherId },
    select: { id: true, email: true, name: true, picture: true },
  });
  res.json({ teacher });
});
