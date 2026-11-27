import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { quizAccess } from "../lib/quizAccess.js";

// ---- Dars matni va darsga izohlar (darsni ko'rish sahifasi: /activity/:id) ----
// Dars = quiz (slaydlar to'plami). Huquqlar:
//   ko'rish (matn + izohlar)  — quizni ko'ra oladigan har kim (admin, egasi, o'quv dasturdagi dars);
//   dars matnini yozish       — slayd tahrirlash huquqi borlar (admin yoki canCreate) — quizAccess.edit;
//   izoh qoldirish            — ko'ra oladiganlar + shu darsni o'tkazgan ustoz (host havolasi orqali);
//   izohni o'chirish          — muallifning o'zi yoki admin.

export const lessonNotesRouter = Router();
lessonNotesRouter.use(requireAuth);

export const LESSON_TEXT_MAX = 20_000;
export const COMMENT_MAX = 2_000;

const commentLimiter = rateLimit({
  windowMs: 60_000,
  max: process.env.NODE_ENV === "test" ? 1000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  // requireAuth'dan keyin — teacherId doim bor (IP ishlatilmaydi)
  keyGenerator: (req) => `lc:${String((req as AuthedRequest).teacherId)}`,
  message: { error: "Juda ko'p izoh. Bir daqiqadan keyin qayta urinib ko'ring." },
});

const clean = (s: string, max: number) =>
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);

async function hostedBy(teacherId: string, quizId: string): Promise<boolean> {
  return !!(await prisma.gameRecord.findFirst({ where: { teacherId, quizId }, select: { id: true } }));
}

async function me(teacherId: string) {
  return prisma.teacher.findUnique({ where: { id: teacherId }, select: { id: true, name: true, isAdmin: true } });
}

// Dars matni + izohlar
lessonNotesRouter.get("/:id/notes", async (req: AuthedRequest, res) => {
  const quizId = String(req.params.id);
  const access = await quizAccess(req.teacherId!, quizId);
  if (!access?.view) {
    res.status(404).json({ error: "Dars topilmadi" });
    return;
  }
  const [lt, comments, user] = await Promise.all([
    prisma.lessonText.findUnique({ where: { quizId } }),
    prisma.lessonComment.findMany({ where: { quizId }, orderBy: { createdAt: "desc" }, take: 200 }),
    me(req.teacherId!),
  ]);
  res.json({
    lessonText: lt?.text ?? "",
    lessonTextUpdatedAt: lt?.updatedAt ?? null,
    lessonTextUpdatedBy: lt?.updatedByName ?? null,
    canEditText: access.edit,
    comments: comments.map((c) => ({
      id: c.id,
      authorName: c.authorName,
      text: c.text,
      source: c.source,
      createdAt: c.createdAt,
      canDelete: user?.isAdmin === true || c.authorId === req.teacherId,
    })),
  });
});

// Dars matnini yozish/yangilash (bo'sh matn — o'chiradi, bo'lim yana yashirinadi)
const textSchema = z.object({ text: z.string().max(LESSON_TEXT_MAX + 1000) });
lessonNotesRouter.put("/:id/lesson-text", async (req: AuthedRequest, res) => {
  const parsed = textSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Dars matni ${LESSON_TEXT_MAX} belgidan oshmasin` });
    return;
  }
  const quizId = String(req.params.id);
  const access = await quizAccess(req.teacherId!, quizId);
  if (!access?.view) {
    res.status(404).json({ error: "Dars topilmadi" });
    return;
  }
  if (!access.edit) {
    res.status(403).json({ error: "Dars matnini faqat admin va slayd tahrirlash huquqi borlar yoza oladi" });
    return;
  }
  const text = clean(parsed.data.text, LESSON_TEXT_MAX);
  if (!text) {
    await prisma.lessonText.deleteMany({ where: { quizId } });
    res.json({ lessonText: "", lessonTextUpdatedAt: null, lessonTextUpdatedBy: null });
    return;
  }
  const user = await me(req.teacherId!);
  const lt = await prisma.lessonText.upsert({
    where: { quizId },
    create: { quizId, text, updatedById: req.teacherId, updatedByName: user?.name ?? null },
    update: { text, updatedById: req.teacherId, updatedByName: user?.name ?? null },
  });
  res.json({ lessonText: lt.text, lessonTextUpdatedAt: lt.updatedAt, lessonTextUpdatedBy: lt.updatedByName });
});

// Izoh qoldirish
const commentSchema = z.object({
  text: z.string().max(COMMENT_MAX + 500),
  source: z.enum(["VIEW", "AFTER_LESSON"]).optional(),
  gameId: z.string().max(100).optional(),
});
lessonNotesRouter.post("/:id/comments", commentLimiter, async (req: AuthedRequest, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: `Izoh ${COMMENT_MAX} belgidan oshmasin` });
    return;
  }
  const text = clean(parsed.data.text, COMMENT_MAX);
  if (!text) {
    res.status(400).json({ error: "Izoh bo'sh bo'lmasin" });
    return;
  }
  const quizId = String(req.params.id);
  const access = await quizAccess(req.teacherId!, quizId);
  if (!access) {
    res.status(404).json({ error: "Dars topilmadi" });
    return;
  }
  // Host havolasi orqali boshqa ustozning darsini o'tkazgan ustoz ham fikr qoldira oladi
  if (!access.view && !(await hostedBy(req.teacherId!, quizId))) {
    res.status(404).json({ error: "Dars topilmadi" });
    return;
  }
  // gameId faqat shu ustozning shu darsdagi sessiyasi bo'lsa saqlanadi
  let gameId: string | null = null;
  if (parsed.data.gameId) {
    const g = await prisma.gameRecord.findFirst({ where: { id: parsed.data.gameId, teacherId: req.teacherId, quizId }, select: { id: true } });
    gameId = g?.id ?? null;
  }
  const user = await me(req.teacherId!);
  const c = await prisma.lessonComment.create({
    data: { quizId, authorId: req.teacherId!, authorName: user?.name ?? "Ustoz", text, source: parsed.data.source ?? "VIEW", gameId },
  });
  res.status(201).json({
    comment: { id: c.id, authorName: c.authorName, text: c.text, source: c.source, createdAt: c.createdAt, canDelete: true },
  });
});

// Izohni o'chirish — muallif yoki admin
lessonNotesRouter.delete("/:id/comments/:cid", async (req: AuthedRequest, res) => {
  const c = await prisma.lessonComment.findFirst({ where: { id: String(req.params.cid), quizId: String(req.params.id) } });
  if (!c) {
    res.status(404).json({ error: "Izoh topilmadi" });
    return;
  }
  const user = await me(req.teacherId!);
  if (c.authorId !== req.teacherId && !user?.isAdmin) {
    res.status(403).json({ error: "Faqat o'z izohingizni o'chira olasiz" });
    return;
  }
  await prisma.lessonComment.delete({ where: { id: c.id } });
  res.json({ ok: true });
});
