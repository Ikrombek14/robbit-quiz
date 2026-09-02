import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireApproved, requireCanCreate, type AuthedRequest } from "../auth.js";

// YANGI o'quv dastur — oylik modullar bo'yicha darslar (O'quv dastur sahifasidagi
// to'rtinchi segment). `module` — oy/kurs sarlavhasi, frontend shu bo'yicha guruhlaydi.
export const newCurriculumRouter = Router();
newCurriculumRouter.use(requireAuth);

async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId } });
  if (!teacher?.isAdmin) {
    res.status(403).json({ error: "Bu amal faqat admin uchun ruxsat etilgan" });
    return;
  }
  next();
}

const lessonSchema = z.object({
  module: z.string().min(1),
  title: z.string().min(1),
  author: z.string().nullable().optional(),
  quizId: z.string().nullable().optional(),
  order: z.number().int().default(0),
});

// Tartib raqamlarini 0..n-1 qilib zichlaydi
async function compactAll(): Promise<void> {
  const ls = await prisma.newCurriculumLesson.findMany({ orderBy: { order: "asc" }, select: { id: true, order: true } });
  const fixes = ls.map((l, i) => ({ id: l.id, from: l.order, to: i })).filter((x) => x.from !== x.to);
  if (fixes.length > 0) {
    await prisma.$transaction(fixes.map((x) => prisma.newCurriculumLesson.update({ where: { id: x.id }, data: { order: x.to } })));
  }
}

// Ro'yxat — tasdiqlangan ustoz (yoki admin), curriculum bilan bir xil kirish
newCurriculumRouter.get("/", requireApproved, async (_req, res) => {
  const lessons = await prisma.newCurriculumLesson.findMany({ orderBy: { order: "asc" } });
  const quizIds = lessons.map((l) => l.quizId).filter((id): id is string => Boolean(id));
  const quizzes = quizIds.length
    ? await prisma.quiz.findMany({
        where: { id: { in: quizIds } },
        select: {
          id: true, title: true, folderId: true,
          folder: { select: { name: true } },
          _count: { select: { slides: true } },
        },
      })
    : [];
  const quizMap = new Map(quizzes.map((q) => [q.id, q]));
  res.json({
    lessons: lessons.map((l) => ({ ...l, quiz: l.quizId ? (quizMap.get(l.quizId) ?? null) : null })),
  });
});

// Yaratish — faqat admin (ro'yxat oxiriga qo'shiladi)
newCurriculumRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = lessonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const d = parsed.data;
  const agg = await prisma.newCurriculumLesson.aggregate({ _max: { order: true } });
  const created = await prisma.newCurriculumLesson.create({
    data: {
      module: d.module.trim().slice(0, 120),
      title: d.title.trim().slice(0, 200),
      author: d.author?.trim() || null,
      quizId: d.quizId || null,
      order: agg._max.order != null ? agg._max.order + 1 : 0,
    },
  });
  res.json({ lesson: created });
});

// Ommaviy qo'shish — [{module,title}] ketma-ketlikda (seed uchun). Faqat admin.
// (module+title) bo'yicha allaqachon borlar o'tkazib yuboriladi — idempotent.
const bulkSchema = z.object({
  items: z.array(z.object({ module: z.string().min(1), title: z.string().min(1) })).min(1).max(500),
});
newCurriculumRouter.post("/bulk", requireAdmin, async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const existing = await prisma.newCurriculumLesson.findMany({ select: { module: true, title: true, order: true } });
  const seen = new Set(existing.map((e) => `${e.module}||${e.title}`.toLowerCase()));
  let nextOrder = existing.length ? Math.max(...existing.map((e) => e.order)) + 1 : 0;
  const toCreate = parsed.data.items.filter((it) => !seen.has(`${it.module.trim()}||${it.title.trim()}`.toLowerCase()));
  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((it) =>
        prisma.newCurriculumLesson.create({
          data: { module: it.module.trim().slice(0, 120), title: it.title.trim().slice(0, 200), order: nextOrder++ },
        }),
      ),
    );
  }
  res.json({ created: toCreate.length, skipped: parsed.data.items.length - toCreate.length });
});

// Tartibni qayta joylash — faqat admin
const reorderSchema = z.object({ ids: z.array(z.string()).min(1) });
newCurriculumRouter.patch("/reorder", requireAdmin, async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    await prisma.$transaction(
      parsed.data.ids.map((id, i) => prisma.newCurriculumLesson.update({ where: { id }, data: { order: i } })),
    );
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Tartibni saqlab bo'lmadi" });
  }
});

// Yangilash — faqat admin
newCurriculumRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = lessonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const d = parsed.data;
  try {
    const lesson = await prisma.newCurriculumLesson.update({
      where: { id: String(req.params.id) },
      data: {
        module: d.module.trim().slice(0, 120),
        title: d.title.trim().slice(0, 200),
        author: d.author?.trim() || null,
        quizId: d.quizId || null,
      },
    });
    res.json({ lesson });
  } catch {
    res.status(404).json({ error: "Dars topilmadi" });
  }
});

// Slayd biriktirish/yechish — "slayd qilish" ruxsati bo'lgan ustoz ham qila oladi
const attachSchema = z.object({ quizId: z.string().nullable() });
newCurriculumRouter.patch("/:id/quiz", requireCanCreate, async (req, res) => {
  const parsed = attachSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    const lesson = await prisma.newCurriculumLesson.update({
      where: { id: String(req.params.id) },
      data: { quizId: parsed.data.quizId },
    });
    res.json({ lesson });
  } catch {
    res.status(404).json({ error: "Dars topilmadi" });
  }
});

// O'chirish — faqat admin
newCurriculumRouter.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await prisma.newCurriculumLesson.delete({ where: { id: String(req.params.id) } });
    await compactAll();
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Dars topilmadi" });
  }
});
