import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { computeScores, parseGrades } from "../services/grades.js";

export const reportRouter = Router();
reportRouter.use(requireAuth);

// O'ynalgan o'yinlar ro'yxati
reportRouter.get("/", async (req: AuthedRequest, res) => {
  const games = await prisma.gameRecord.findMany({
    where: { teacherId: req.teacherId },
    orderBy: { playedAt: "desc" },
    include: { _count: { select: { players: true } } },
  });
  res.json({
    reports: games.map((g) => ({
      id: g.id,
      title: g.title,
      pin: g.pin,
      mode: g.mode,
      playedAt: g.playedAt,
      totalSlides: g.totalSlides,
      playerCount: g._count.players,
    })),
  });
});

// Bitta o'yin hisoboti (o'quvchilar + savol statistikasi)
reportRouter.get("/:id", async (req: AuthedRequest, res) => {
  const game = await prisma.gameRecord.findFirst({
    where: { id: String(req.params.id), teacherId: req.teacherId },
    include: { players: { orderBy: { score: "desc" } } },
  });
  if (!game) {
    res.status(404).json({ error: "Hisobot topilmadi" });
    return;
  }
  let questionStats: unknown = [];
  try {
    questionStats = JSON.parse(game.questionStats);
  } catch {
    questionStats = [];
  }
  res.json({
    report: {
      id: game.id,
      title: game.title,
      pin: game.pin,
      mode: game.mode,
      playedAt: game.playedAt,
      totalSlides: game.totalSlides,
      groupName: game.groupName,
      // Baholash funksiyasidan oldingi darslarda baho yo'q (grades = "{}")
      hasGrades: game.players.some((p) => (p.grades ?? "{}").trim() !== "{}"),
      questionStats,
      players: game.players.map((p) => {
        let details: unknown = [];
        try {
          details = JSON.parse(p.details ?? "[]");
        } catch {
          details = [];
        }
        // Jonli rejim: savollar bo'yicha javoblar (eski hisobotlarda yo'q → null)
        let answers: { answered: number[]; correct: number[] } | null = null;
        try {
          const a = JSON.parse(p.answers ?? "{}");
          if (Array.isArray(a?.answered) && Array.isArray(a?.correct)) answers = { answered: a.answered, correct: a.correct };
        } catch {
          answers = null;
        }
        const grades = parseGrades(p.grades);
        return {
          id: p.id,
          nickname: p.nickname,
          grades,
          scores: computeScores(grades),
          score: p.score,
          correctCount: p.correctCount,
          totalAnswered: p.totalAnswered,
          details,
          answers,
        };
      }),
    },
  });
});

// Sessiya guruhi (oylik reyting guruh ichida hisoblanadi)
reportRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const raw = typeof req.body?.groupName === "string" ? req.body.groupName.trim().slice(0, 80) : "";
  const r = await prisma.gameRecord.updateMany({
    where: { id: String(req.params.id), teacherId: req.teacherId },
    data: { groupName: raw || null },
  });
  if (!r.count) {
    res.status(404).json({ error: "Hisobot topilmadi" });
    return;
  }
  res.json({ ok: true, groupName: raw || null });
});

// Dars tugagach baholarni tuzatish (masalan, amaliyotni keyin tekshirib qo'yish)
reportRouter.put("/:id/players/:pid/grades", async (req: AuthedRequest, res) => {
  const player = await prisma.gamePlayerRecord.findFirst({
    where: { id: String(req.params.pid), gameId: String(req.params.id), game: { teacherId: req.teacherId } },
    select: { id: true, grades: true },
  });
  if (!player) {
    res.status(404).json({ error: "O'quvchi topilmadi" });
    return;
  }
  const old = parseGrades(player.grades);
  const b = req.body ?? {};
  // Quiz bali o'yindan keladi — qo'lda o'zgartirilmaydi
  const next = parseGrades({ ...old, ...b, quizSum: old.quizSum, quizMax: old.quizMax });
  await prisma.gamePlayerRecord.update({ where: { id: player.id }, data: { grades: JSON.stringify(next) } });
  res.json({ ok: true, grades: next, scores: computeScores(next) });
});
