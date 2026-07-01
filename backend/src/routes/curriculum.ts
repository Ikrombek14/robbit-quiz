import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireApproved, requireCanCreate, type AuthedRequest } from "../auth.js";

export const curriculumRouter = Router();
curriculumRouter.use(requireAuth);

// Faqat admin uchun middleware
async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId } });
  if (!teacher?.isAdmin) {
    res.status(403).json({ error: "Bu amal faqat admin uchun ruxsat etilgan" });
    return;
  }
  next();
}

const lessonSchema = z.object({
  subject: z.enum(["ROBOTEXNIKA", "DASTURLASH"]),
  ageGroup: z.enum(["MIDDLE", "SENIOR"]),
  year: z.number().int().min(1).max(4),
  section: z.string().nullable().optional(),
  order: z.number().int().default(0),
  title: z.string().min(1),
  author: z.string().nullable().optional(),
  isDemo: z.boolean().default(false),
  quizId: z.string().nullable().optional(),
});

// Dars sarlavhasi boshidagi tartib prefiksini tozalaydi ("1-dars. ", "12. ",
// "3) ") — ro'yxatда/dastur ko'rinishida raqam allaqachon qo'yiladi, takror bo'lmasin.
function cleanTitle(raw: string): string {
  const t = String(raw ?? "").trim();
  const stripped = t.replace(/^\s*\d+\s*[-.)]?\s*(dars\s*[.:]?)?\s*/i, "").trim();
  return (stripped || t).slice(0, 200);
}

// Ro'yxat — filter bilan (faqat roster'da tasdiqlangan / admin)
curriculumRouter.get("/", requireApproved, async (req, res) => {
  const { subject, ageGroup, year, section } = req.query;
  const where: Record<string, unknown> = {};
  if (subject) where.subject = String(subject);
  if (ageGroup) where.ageGroup = String(ageGroup);
  if (year) where.year = Number(year);
  if (section !== undefined) where.section = section ? String(section) : null;

  const lessons = await prisma.lessonPlan.findMany({
    where,
    orderBy: { order: "asc" },
  });

  // Biriktrilgan quizlar uchun sarlavhalarni olamiz
  const quizIds = lessons.map((l) => l.quizId).filter((id): id is string => Boolean(id));
  const quizzes = quizIds.length
    ? await prisma.quiz.findMany({
        where: { id: { in: quizIds } },
        select: { id: true, title: true, _count: { select: { slides: true } } },
      })
    : [];
  const quizMap = new Map(quizzes.map((q) => [q.id, q]));

  res.json({
    lessons: lessons.map((l) => ({
      ...l,
      quiz: l.quizId ? (quizMap.get(l.quizId) ?? null) : null,
    })),
  });
});

// Bitta quizga biriktirilgan barcha o'quv-reja joylashuvlari (faqat admin).
// Muharrirdagi "Sozlamalar → O'quv rejaga qo'shish" paneli shu orqali joriy
// holatni ko'rsatadi. Bir quiz bir nechta yo'nalish/bo'lim/yilda — har biri
// alohida tartib raqami bilan tura oladi.
curriculumRouter.get("/for-quiz/:quizId", requireAdmin, async (req, res) => {
  const lessons = await prisma.lessonPlan.findMany({
    where: { quizId: String(req.params.quizId) },
    orderBy: [{ subject: "asc" }, { ageGroup: "asc" }, { year: "asc" }, { order: "asc" }],
  });
  res.json({ lessons });
});

// Darslar tartibini qayta joylash (drag&drop) — faqat admin.
// Kelgan `ids` ketma-ketligi bo'yicha har bir darsning `order` maydoni
// 0..n-1 qilib yangilanadi. Bir filtr (yo'nalish/yosh/yil/bo'lim) ichidagi
// darslar ro'yxati yuboriladi.
const reorderSchema = z.object({ ids: z.array(z.string()).min(1) });
curriculumRouter.patch("/reorder", requireAdmin, async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    await prisma.$transaction(
      parsed.data.ids.map((id, i) =>
        prisma.lessonPlan.update({ where: { id }, data: { order: i } }),
      ),
    );
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Tartibni saqlab bo'lmadi" });
  }
});

// Yaratish — faqat admin
curriculumRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = lessonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const lesson = await prisma.lessonPlan.create({
    data: {
      ...parsed.data,
      section: parsed.data.section ?? null,
      quizId: parsed.data.quizId ?? null,
    },
  });
  res.json({ lesson });
});

// Ommaviy: PAPKADAN darslar yaratish — faqat admin.
// Tanlangan papkadagi har quizdan bitta dars yaratiladi (quiz avtomatik
// biriktiriladi), kutubxona tartibida (updatedAt desc → 1-dars birinchi).
// Shu bo'limda o'sha quiz allaqachon dars bo'lsa — o'tkazib yuboriladi (dedup).
const fromFolderSchema = z.object({
  subject: z.enum(["ROBOTEXNIKA", "DASTURLASH"]),
  ageGroup: z.enum(["MIDDLE", "SENIOR"]),
  year: z.number().int().min(1).max(4),
  section: z.string().nullable().optional(),
  folderId: z.string().min(1),
  stripPrefix: z.boolean().default(true),
});
curriculumRouter.post("/from-folder", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = fromFolderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const { subject, ageGroup, year, folderId, stripPrefix } = parsed.data;
  const section = subject === "ROBOTEXNIKA" ? (parsed.data.section ?? null) : null;

  // Papka joriy adminniki bo'lishi kerak
  const folder = await prisma.folder.findFirst({ where: { id: folderId, teacherId: req.teacherId } });
  if (!folder) {
    res.status(404).json({ error: "Papka topilmadi" });
    return;
  }
  const quizzes = await prisma.quiz.findMany({
    where: { folderId },
    orderBy: { updatedAt: "desc" }, // kutubxona tartibi: 1-dars birinchi
    select: { id: true, title: true },
  });
  if (quizzes.length === 0) {
    res.status(400).json({ error: "Papkada quiz yo'q" });
    return;
  }

  // Shu bo'limdagi mavjud darslar: dedup (quizId) + joriy eng katta order
  const existing = await prisma.lessonPlan.findMany({
    where: { subject, ageGroup, year, section },
    select: { order: true, quizId: true },
  });
  const usedQuizIds = new Set(existing.map((e) => e.quizId).filter(Boolean));
  let nextOrder = existing.length ? Math.max(...existing.map((e) => e.order)) + 1 : 0;

  const toCreate = quizzes.filter((q) => !usedQuizIds.has(q.id));
  const skipped = quizzes.length - toCreate.length;

  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((q) =>
        prisma.lessonPlan.create({
          data: {
            subject,
            ageGroup,
            year,
            section,
            order: nextOrder++,
            title: stripPrefix ? cleanTitle(q.title) : q.title.trim().slice(0, 200),
            quizId: q.id,
            isDemo: false,
          },
        }),
      ),
    );
  }
  res.json({ created: toCreate.length, skipped });
});

// Ommaviy: MAVZULAR RO'YXATIDAN darslar qo'shish — faqat admin.
// Har qatorga bitta mavzu; quiz keyinroq biriktiriladi.
const bulkTitlesSchema = z.object({
  subject: z.enum(["ROBOTEXNIKA", "DASTURLASH"]),
  ageGroup: z.enum(["MIDDLE", "SENIOR"]),
  year: z.number().int().min(1).max(4),
  section: z.string().nullable().optional(),
  titles: z.array(z.string()).min(1),
});
curriculumRouter.post("/bulk-titles", requireAdmin, async (req, res) => {
  const parsed = bulkTitlesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const { subject, ageGroup, year } = parsed.data;
  const section = subject === "ROBOTEXNIKA" ? (parsed.data.section ?? null) : null;
  const titles = parsed.data.titles.map((t) => cleanTitle(t)).filter(Boolean);
  if (titles.length === 0) {
    res.status(400).json({ error: "Mavzu topilmadi" });
    return;
  }

  const agg = await prisma.lessonPlan.aggregate({
    where: { subject, ageGroup, year, section },
    _max: { order: true },
  });
  let nextOrder = agg._max.order != null ? agg._max.order + 1 : 0;

  await prisma.$transaction(
    titles.map((title) =>
      prisma.lessonPlan.create({
        data: { subject, ageGroup, year, section, order: nextOrder++, title, isDemo: false },
      }),
    ),
  );
  res.json({ created: titles.length });
});

// Yangilash — faqat admin
curriculumRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = lessonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    const lesson = await prisma.lessonPlan.update({
      where: { id: String(req.params.id) },
      data: {
        ...parsed.data,
        section: parsed.data.section ?? null,
        quizId: parsed.data.quizId ?? null,
      },
    });
    res.json({ lesson });
  } catch {
    res.status(404).json({ error: "Dars topilmadi" });
  }
});

// Darsga quiz biriktirish/yechish — "slayd qilish" ruxsati bo'lgan ustoz ham qila oladi.
// Faqat quizId o'zgaradi (darsning boshqa maydonlariga tegmaydi).
const attachSchema = z.object({ quizId: z.string().nullable() });
curriculumRouter.patch("/:id/quiz", requireCanCreate, async (req, res) => {
  const parsed = attachSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    const lesson = await prisma.lessonPlan.update({
      where: { id: String(req.params.id) },
      data: { quizId: parsed.data.quizId },
    });
    res.json({ lesson });
  } catch {
    res.status(404).json({ error: "Dars topilmadi" });
  }
});

// O'chirish — faqat admin
curriculumRouter.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await prisma.lessonPlan.delete({ where: { id: String(req.params.id) } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Dars topilmadi" });
  }
});
