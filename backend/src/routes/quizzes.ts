import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, type AuthedRequest } from "../auth.js";

export const quizRouter = Router();
quizRouter.use(requireAuth);

// Joriy foydalanuvchi admin'mi? (admin barcha o'qituvchilarning quizlarini ko'radi/boshqaradi)
async function isAdminUser(teacherId?: string): Promise<boolean> {
  if (!teacherId) return false;
  const t = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { isAdmin: true } });
  return t?.isAdmin === true;
}

const slideSchema = z.object({
  kind: z.enum(["CONTENT", "QUESTION"]),
  type: z.string().nullable().optional(),
  data: z.any().default({}),
  notes: z.string().nullable().optional(),
  timeLimit: z.number().int().min(5).max(300).default(20),
  points: z.number().int().min(0).max(2000).default(1000),
});

const quizSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  shuffle: z.boolean().optional().default(false),
  slides: z.array(slideSchema).default([]),
});

type SlideInput = z.infer<typeof slideSchema>;

function buildSlideCreate(slides: SlideInput[]) {
  return slides.map((s, i) => ({
    order: i,
    kind: s.kind,
    type: s.type ?? null,
    data: JSON.stringify(s.data ?? {}),
    notes: s.notes ?? null,
    timeLimit: s.timeLimit,
    points: s.points,
  }));
}

interface SlideRow {
  id: string;
  order: number;
  kind: string;
  type: string | null;
  data: string;
  notes: string | null;
  timeLimit: number;
  points: number;
}

function parseSlide(s: SlideRow) {
  let data: unknown = {};
  try {
    data = JSON.parse(s.data);
  } catch {
    data = {};
  }
  return {
    id: s.id,
    kind: s.kind,
    type: s.type,
    data,
    notes: s.notes,
    timeLimit: s.timeLimit,
    points: s.points,
  };
}

// Ro'yxat — admin barcha o'qituvchilarning loyihalarini ko'radi (egasi bilan)
quizRouter.get("/", async (req: AuthedRequest, res) => {
  const admin = await isAdminUser(req.teacherId);
  const quizzes = await prisma.quiz.findMany({
    where: admin ? {} : { teacherId: req.teacherId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { slides: true } },
      teacher: { select: { id: true, name: true, email: true } },
    },
  });
  res.json({
    isAdmin: admin,
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      updatedAt: q.updatedAt,
      _count: q._count,
      owner: { id: q.teacher.id, name: q.teacher.name, email: q.teacher.email },
      mine: q.teacherId === req.teacherId,
    })),
  });
});

// Bitta quiz (to'liq) — admin har qanday loyihani ko'ra oladi
quizRouter.get("/:id", async (req: AuthedRequest, res) => {
  const admin = await isAdminUser(req.teacherId);
  const quiz = await prisma.quiz.findFirst({
    where: admin ? { id: String(req.params.id) } : { id: String(req.params.id), teacherId: req.teacherId },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  if (!quiz) {
    res.status(404).json({ error: "Quiz topilmadi" });
    return;
  }
  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      shuffle: quiz.shuffle,
      slides: quiz.slides.map(parseSlide),
    },
  });
});

// Yaratish
quizRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = quizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const { title, description, shuffle, slides } = parsed.data;
  const quiz = await prisma.quiz.create({
    data: {
      title,
      description: description ?? null,
      shuffle,
      teacherId: req.teacherId!,
      slides: { create: buildSlideCreate(slides) },
    },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      shuffle: quiz.shuffle,
      slides: quiz.slides.map(parseSlide),
    },
  });
});

// Yangilash (slaydlar to'liq almashtiriladi)
quizRouter.put("/:id", async (req: AuthedRequest, res) => {
  const parsed = quizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const admin = await isAdminUser(req.teacherId);
  const owned = await prisma.quiz.findFirst({
    where: admin ? { id: String(req.params.id) } : { id: String(req.params.id), teacherId: req.teacherId },
  });
  if (!owned) {
    res.status(404).json({ error: "Quiz topilmadi" });
    return;
  }
  const { title, description, shuffle, slides } = parsed.data;
  await prisma.slide.deleteMany({ where: { quizId: owned.id } });
  const quiz = await prisma.quiz.update({
    where: { id: owned.id },
    data: {
      title,
      description: description ?? null,
      shuffle,
      slides: { create: buildSlideCreate(slides) },
    },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      shuffle: quiz.shuffle,
      slides: quiz.slides.map(parseSlide),
    },
  });
});

// O'chirish — admin har qanday loyihani o'chira oladi
quizRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const admin = await isAdminUser(req.teacherId);
  const owned = await prisma.quiz.findFirst({
    where: admin ? { id: String(req.params.id) } : { id: String(req.params.id), teacherId: req.teacherId },
  });
  if (!owned) {
    res.status(404).json({ error: "Quiz topilmadi" });
    return;
  }
  await prisma.quiz.delete({ where: { id: owned.id } });
  res.json({ ok: true });
});
