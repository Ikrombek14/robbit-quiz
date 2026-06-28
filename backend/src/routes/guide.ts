import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireApproved, type AuthedRequest } from "../auth.js";

export const guideRouter = Router();
guideRouter.use(requireAuth);

// Faqat admin uchun middleware
async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId } });
  if (!teacher?.isAdmin) {
    res.status(403).json({ error: "Bu amal faqat admin uchun ruxsat etilgan" });
    return;
  }
  next();
}

const sectionSchema = z.object({
  order: z.number().int().default(0),
  title: z.string().min(1),
  body: z.string().default(""),
  icon: z.string().nullable().optional(),
});

// Ro'yxat — faqat roster'da tasdiqlangan / admin
guideRouter.get("/", requireApproved, async (_req, res) => {
  const sections = await prisma.guideSection.findMany({ orderBy: { order: "asc" } });
  res.json({ sections });
});

// Yaratish — faqat admin
guideRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = sectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const section = await prisma.guideSection.create({
    data: { ...parsed.data, icon: parsed.data.icon ?? null },
  });
  res.json({ section });
});

// Yangilash — faqat admin
guideRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = sectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    const section = await prisma.guideSection.update({
      where: { id: String(req.params.id) },
      data: { ...parsed.data, icon: parsed.data.icon ?? null },
    });
    res.json({ section });
  } catch {
    res.status(404).json({ error: "Bo'lim topilmadi" });
  }
});

// O'chirish — faqat admin
guideRouter.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await prisma.guideSection.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Bo'lim topilmadi" });
  }
});
