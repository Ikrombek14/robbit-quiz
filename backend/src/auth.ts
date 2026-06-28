import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";
import { prisma } from "./prisma.js";

export interface AuthedRequest extends Request {
  teacherId?: string;
}

export function signToken(teacherId: string): string {
  return jwt.sign({ sub: teacherId }, config.jwtSecret, { expiresIn: "7d" });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Avtorizatsiya talab qilinadi" });
    return;
  }
  const teacherId = verifyToken(header.slice(7));
  if (!teacherId) {
    res.status(401).json({ error: "Token yaroqsiz yoki muddati o'tgan" });
    return;
  }
  req.teacherId = teacherId;
  next();
}

// Faqat admin uchun (requireAuth dan keyin)
export async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId }, select: { isAdmin: true } });
  if (!teacher?.isAdmin) {
    res.status(403).json({ error: "Bu amal faqat admin uchun ruxsat etilgan" });
    return;
  }
  next();
}

// Roster'da tasdiqlangan (yoki admin) uchun — O'quv reja / Yo'riqnoma
export async function requireApproved(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId }, select: { isAdmin: true, approved: true } });
  if (!teacher?.isAdmin && !teacher?.approved) {
    res.status(403).json({ error: "Bu bo'lim faqat ro'yxatdagi ustozlar uchun. Admin bilan bog'laning." });
    return;
  }
  next();
}
