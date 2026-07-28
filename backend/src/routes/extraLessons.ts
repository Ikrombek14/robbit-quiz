import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireApproved, requireCanCreate, type AuthedRequest } from "../auth.js";

// Qo'shimcha darslar — O'quv dastur sahifasidagi uchinchi (alohida) bo'lim.
// Yosh toifasi/yo'nalish/yilga bo'linmaydi: hammasi bitta umumiy ro'yxatda,
// dars nomi bilan turadi. Asosiy o'quv rejadan tashqaridagi qo'shimcha mavzular.
export const extraLessonsRouter = Router();
extraLessonsRouter.use(requireAuth);

async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId } });
  if (!teacher?.isAdmin) {
    res.status(403).json({ error: "Bu amal faqat admin uchun ruxsat etilgan" });
    return;
  }
  next();
}

const extraSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  quizId: z.string().nullable().optional(),
  order: z.number().int().default(0),
});

// Sarlavha boshidagi tartib prefiksini tozalaydi ("1. ", "2) ", "3-dars. ")
function cleanTitle(raw: string): string {
  const t = String(raw ?? "").trim();
  const stripped = t.replace(/^\s*\d+\s*[-.)]?\s*(dars\s*[.:]?)?\s*/i, "").trim();
  return (stripped || t).slice(0, 200);
}

// Tartib raqamlarini 0..n-1 qilib zichlaydi (o'chirishdan keyin teshik qolmasin)
async function compactAll(): Promise<void> {
  const ls = await prisma.extraLesson.findMany({ orderBy: { order: "asc" }, select: { id: true, order: true } });
  const fixes = ls.map((l, i) => ({ id: l.id, from: l.order, to: i })).filter((x) => x.from !== x.to);
  if (fixes.length > 0) {
    await prisma.$transaction(fixes.map((x) => prisma.extraLesson.update({ where: { id: x.id }, data: { order: x.to } })));
  }
}

// Ro'yxat — biriktirilgan slayd ma'lumoti bilan. Tasdiqlangan ustoz (yoki admin) ko'radi
// (O'quv dastur ichida bo'lgani uchun — curriculum bilan bir xil kirish).
extraLessonsRouter.get("/", requireApproved, async (_req, res) => {
  const lessons = await prisma.extraLesson.findMany({ orderBy: { order: "asc" } });

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

// Yaratish — faqat admin. So'ralgan o'ringa KIRITILADI, ro'yxat 0..n-1 qayta raqamlanadi.
extraLessonsRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = extraSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const { order: requestedOrder, ...rest } = parsed.data;
  const created = await prisma.extraLesson.create({
    data: {
      title: rest.title.trim().slice(0, 200),
      description: rest.description?.trim() || null,
      author: rest.author?.trim() || null,
      quizId: rest.quizId || null,
    },
  });
  const others = await prisma.extraLesson.findMany({
    where: { id: { not: created.id } },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const idx = Math.max(0, Math.min(requestedOrder, others.length));
  const seq = [...others.slice(0, idx).map((o) => o.id), created.id, ...others.slice(idx).map((o) => o.id)];
  await prisma.$transaction(seq.map((sid, i) => prisma.extraLesson.update({ where: { id: sid }, data: { order: i } })));

  const fresh = await prisma.extraLesson.findUnique({ where: { id: created.id } });
  res.json({ lesson: fresh ?? created });
});

// Ommaviy: nomlar ro'yxatidan qo'shimcha darslar qo'shish — faqat admin
const bulkTitlesSchema = z.object({ titles: z.array(z.string()).min(1) });
extraLessonsRouter.post("/bulk-titles", requireAdmin, async (req, res) => {
  const parsed = bulkTitlesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const titles = parsed.data.titles.map((t) => cleanTitle(t)).filter(Boolean);
  if (titles.length === 0) {
    res.status(400).json({ error: "Nom topilmadi" });
    return;
  }
  const agg = await prisma.extraLesson.aggregate({ _max: { order: true } });
  let nextOrder = agg._max.order != null ? agg._max.order + 1 : 0;
  await prisma.$transaction(
    titles.map((title) => prisma.extraLesson.create({ data: { title, order: nextOrder++ } })),
  );
  res.json({ created: titles.length });
});

// Ommaviy: PAPKADAN qo'shimcha darslar yaratish — faqat admin (har quizdan bitta dars)
const fromFolderSchema = z.object({ folderId: z.string().min(1), stripPrefix: z.boolean().default(true) });
extraLessonsRouter.post("/from-folder", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = fromFolderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const { folderId, stripPrefix } = parsed.data;
  const folder = await prisma.folder.findFirst({ where: { id: folderId, teacherId: req.teacherId } });
  if (!folder) {
    res.status(404).json({ error: "Papka topilmadi" });
    return;
  }
  const quizzes = await prisma.quiz.findMany({
    where: { folderId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
  if (quizzes.length === 0) {
    res.status(400).json({ error: "Papkada quiz yo'q" });
    return;
  }

  const existing = await prisma.extraLesson.findMany({ select: { order: true, quizId: true } });
  const usedQuizIds = new Set(existing.map((e) => e.quizId).filter(Boolean));
  let nextOrder = existing.length ? Math.max(...existing.map((e) => e.order)) + 1 : 0;

  const toCreate = quizzes.filter((q) => !usedQuizIds.has(q.id));
  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((q) =>
        prisma.extraLesson.create({
          data: {
            order: nextOrder++,
            title: stripPrefix ? cleanTitle(q.title) : q.title.trim().slice(0, 200),
            quizId: q.id,
          },
        }),
      ),
    );
  }
  res.json({ created: toCreate.length, skipped: quizzes.length - toCreate.length });
});

// Tartibni qayta joylash (drag&drop) — faqat admin
const reorderSchema = z.object({ ids: z.array(z.string()).min(1) });
extraLessonsRouter.patch("/reorder", requireAdmin, async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    await prisma.$transaction(
      parsed.data.ids.map((id, i) => prisma.extraLesson.update({ where: { id }, data: { order: i } })),
    );
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Tartibni saqlab bo'lmadi" });
  }
});

// Yangilash — faqat admin (tartib o'zgarsa qayta raqamlanadi)
extraLessonsRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = extraSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.extraLesson.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Dars topilmadi" });
    return;
  }
  const { order: requestedOrder, ...rest } = parsed.data;
  const others = await prisma.extraLesson.findMany({
    where: { id: { not: id } },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  const idx = Math.max(0, Math.min(requestedOrder, others.length));
  const seq = [...others.slice(0, idx).map((o) => o.id), id, ...others.slice(idx).map((o) => o.id)];

  await prisma.$transaction([
    prisma.extraLesson.update({
      where: { id },
      data: {
        title: rest.title.trim().slice(0, 200),
        description: rest.description?.trim() || null,
        author: rest.author?.trim() || null,
        quizId: rest.quizId || null,
      },
    }),
    ...seq.map((sid, i) => prisma.extraLesson.update({ where: { id: sid }, data: { order: i } })),
  ]);

  const lesson = await prisma.extraLesson.findUnique({ where: { id } });
  res.json({ lesson });
});

// Slayd biriktirish/yechish — "slayd qilish" ruxsati bo'lgan ustoz ham qila oladi
const attachSchema = z.object({ quizId: z.string().nullable() });
extraLessonsRouter.patch("/:id/quiz", requireCanCreate, async (req, res) => {
  const parsed = attachSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    const lesson = await prisma.extraLesson.update({
      where: { id: String(req.params.id) },
      data: { quizId: parsed.data.quizId },
    });
    res.json({ lesson });
  } catch {
    res.status(404).json({ error: "Dars topilmadi" });
  }
});

// Ommaviy o'chirish — faqat admin
extraLessonsRouter.post("/bulk-delete", requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
  if (ids.length === 0) {
    res.status(400).json({ error: "ids bo'sh" });
    return;
  }
  const r = await prisma.extraLesson.deleteMany({ where: { id: { in: ids } } });
  await compactAll();
  res.json({ deleted: r.count });
});

// O'chirish — faqat admin
extraLessonsRouter.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await prisma.extraLesson.delete({ where: { id: String(req.params.id) } });
    await compactAll();
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Dars topilmadi" });
  }
});
