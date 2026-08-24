import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requirePanel, type AuthedRequest } from "../auth.js";

// Ustozlik amaliyoti vazifalari — kategoriya bo'yicha guruhlangan amaliy topshiriqlar.
// Har vazifada: bajariladigan topshiriq (matn), video havolasi (embed) va kerakli
// resurslar (havolalar ro'yxati). Barcha markaz xodimlari ko'radi, admin boshqaradi.
export const practiceRouter = Router();
practiceRouter.use(requireAuth);

async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId } });
  if (!teacher?.isAdmin) {
    res.status(403).json({ error: "Bu amal faqat admin uchun ruxsat etilgan" });
    return;
  }
  next();
}

const resourceSchema = z.object({
  label: z.string().default(""),
  url: z.string().default(""),
});
const taskSchema = z.object({
  category: z.string().default(""),
  title: z.string().default(""),
  tasks: z.string().default(""),
  videoUrl: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  resources: z.array(resourceSchema).default([]),
  order: z.number().int().default(0),
});

// DB satridagi resources JSON-string'ni massivga aylantiradi
function parseTask(t: {
  id: string; category: string; order: number; title: string;
  tasks: string; videoUrl: string | null; imageUrl: string | null; resources: string; createdAt: Date;
}) {
  let resources: { label: string; url: string }[] = [];
  try {
    const arr = JSON.parse(t.resources);
    if (Array.isArray(arr)) resources = arr.filter((r) => r && typeof r === "object").map((r) => ({ label: String(r.label ?? ""), url: String(r.url ?? "") }));
  } catch { /* buzuq JSON — bo'sh */ }
  return { ...t, resources };
}

// Tartib raqamlarini 0..n-1 qilib zichlaydi (o'chirishdan keyin teshik qolmasin)
async function compactAll(): Promise<void> {
  const list = await prisma.practiceTask.findMany({ orderBy: { order: "asc" }, select: { id: true, order: true } });
  const fixes = list.map((w, i) => ({ id: w.id, from: w.order, to: i })).filter((x) => x.from !== x.to);
  if (fixes.length > 0) {
    await prisma.$transaction(fixes.map((x) => prisma.practiceTask.update({ where: { id: x.id }, data: { order: x.to } })));
  }
}

// Ro'yxat — barcha markaz xodimlari (admin, ustoz, ofis admin, kutilayotgan ustoz).
// Amaliyot vazifalari umumiy, tasdiqni kutmaydi.
practiceRouter.get("/", requirePanel, async (_req, res) => {
  const tasks = await prisma.practiceTask.findMany({ orderBy: { order: "asc" } });
  res.json({ tasks: tasks.map(parseTask) });
});

// Yaratish — faqat admin. Ro'yxat oxiriga qo'shiladi.
practiceRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const d = parsed.data;
  const agg = await prisma.practiceTask.aggregate({ _max: { order: true } });
  const nextOrder = agg._max.order != null ? agg._max.order + 1 : 0;
  const created = await prisma.practiceTask.create({
    data: {
      category: d.category.trim().slice(0, 80),
      title: d.title.trim().slice(0, 200),
      tasks: d.tasks.trim().slice(0, 5000),
      videoUrl: d.videoUrl?.trim() || null,
      imageUrl: d.imageUrl?.trim() || null,
      resources: JSON.stringify(d.resources.filter((r) => r.label.trim() || r.url.trim())),
      order: nextOrder,
    },
  });
  res.json({ task: parseTask(created) });
});

// Yangilash — faqat admin
practiceRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const d = parsed.data;
  try {
    const updated = await prisma.practiceTask.update({
      where: { id: String(req.params.id) },
      data: {
        category: d.category.trim().slice(0, 80),
        title: d.title.trim().slice(0, 200),
        tasks: d.tasks.trim().slice(0, 5000),
        videoUrl: d.videoUrl?.trim() || null,
        imageUrl: d.imageUrl?.trim() || null,
        resources: JSON.stringify(d.resources.filter((r) => r.label.trim() || r.url.trim())),
      },
    });
    res.json({ task: parseTask(updated) });
  } catch {
    res.status(404).json({ error: "Vazifa topilmadi" });
  }
});

// Tartibni qayta joylash (drag&drop) — faqat admin
const reorderSchema = z.object({ ids: z.array(z.string()).min(1) });
practiceRouter.patch("/reorder", requireAdmin, async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    await prisma.$transaction(
      parsed.data.ids.map((id, i) => prisma.practiceTask.update({ where: { id }, data: { order: i } })),
    );
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Tartibni saqlab bo'lmadi" });
  }
});

// O'chirish — faqat admin
practiceRouter.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await prisma.practiceTask.delete({ where: { id: String(req.params.id) } });
    await compactAll();
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Vazifa topilmadi" });
  }
});
