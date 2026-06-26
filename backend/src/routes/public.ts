import { Router } from "express";
import { prisma } from "../prisma.js";

export const publicRouter = Router();

interface SlideRow {
  id: string;
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
  return { id: s.id, kind: s.kind, type: s.type, data, timeLimit: s.timeLimit, points: s.points };
}

// Ulashilgan dars (auth'siz) — havola orqali o'quvchilar uchun
publicRouter.get("/quizzes/:id", async (req, res) => {
  const quiz = await prisma.quiz.findUnique({
    where: { id: String(req.params.id) },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  if (!quiz) {
    res.status(404).json({ error: "Dars topilmadi" });
    return;
  }
  res.json({
    quiz: { id: quiz.id, title: quiz.title, slides: quiz.slides.map(parseSlide) },
  });
});

interface QStat {
  index: number;
  text: string;
  correct: number;
  total: number;
}

// Mustaqil (homework) natijani saqlash — o'qituvchi Sessiyalarda ko'radi
publicRouter.post("/quizzes/:id/result", async (req, res) => {
  const quizId = String(req.params.id);
  const body = req.body ?? {};
  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { _count: { select: { slides: true } } },
  });
  if (!quiz) {
    res.status(404).json({ error: "Dars topilmadi" });
    return;
  }

  // Shu dars uchun yagona "Vazifa" yozuvini topamiz yoki yaratamiz
  let rec = await prisma.gameRecord.findFirst({ where: { quizId, mode: "HOMEWORK" } });
  if (!rec) {
    rec = await prisma.gameRecord.create({
      data: {
        teacherId: quiz.teacherId,
        quizId,
        title: quiz.title,
        pin: "—",
        mode: "HOMEWORK",
        totalSlides: quiz._count.slides,
        questionStats: "[]",
      },
    });
  }

  await prisma.gamePlayerRecord.create({
    data: {
      gameId: rec.id,
      nickname: String(body.nickname ?? "O'quvchi").slice(0, 20),
      score: Number(body.score) || 0,
      correctCount: Number(body.correctCount) || 0,
      totalAnswered: Number(body.totalAnswered) || 0,
    },
  });

  // Savol statistikasini birlashtiramiz
  let stats: QStat[] = [];
  try {
    stats = JSON.parse(rec.questionStats);
  } catch {
    stats = [];
  }
  const byIndex = new Map<number, QStat>(stats.map((s) => [s.index, s]));
  const perQuestion = Array.isArray(body.perQuestion) ? body.perQuestion : [];
  for (const q of perQuestion) {
    const idx = Number(q.index);
    let st = byIndex.get(idx);
    if (!st) {
      st = { index: idx, text: String(q.text ?? `Savol ${idx + 1}`), correct: 0, total: 0 };
      byIndex.set(idx, st);
    }
    st.total += 1;
    if (q.correct) st.correct += 1;
  }
  const merged = [...byIndex.values()].sort((a, b) => a.index - b.index);
  await prisma.gameRecord.update({ where: { id: rec.id }, data: { questionStats: JSON.stringify(merged) } });

  res.json({ ok: true });
});
