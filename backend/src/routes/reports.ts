import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, type AuthedRequest } from "../auth.js";

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
      questionStats,
      players: game.players.map((p) => {
        let details: unknown = [];
        try {
          details = JSON.parse((p as { details?: string }).details ?? "[]");
        } catch {
          details = [];
        }
        return {
          nickname: p.nickname,
          score: p.score,
          correctCount: p.correctCount,
          totalAnswered: p.totalAnswered,
          details,
        };
      }),
    },
  });
});
