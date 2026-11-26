import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { currentMonth } from "../services/grades.js";
import { monthlyStats, signParentToken, verifyParentToken } from "../services/gradeStats.js";

// ---- Oylik reyting (ustoz) ----
export const gradesRouter = Router();
gradesRouter.use(requireAuth);

const groupParam = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, 80) : null;
};

// Ustozning guruh nomlari (sessiyalarda belgilangan)
gradesRouter.get("/groups", async (req: AuthedRequest, res) => {
  const rows = await prisma.gameRecord.findMany({
    where: { teacherId: req.teacherId, groupName: { not: null } },
    distinct: ["groupName"],
    select: { groupName: true },
    orderBy: { groupName: "asc" },
  });
  res.json({ groups: rows.map((r) => r.groupName).filter(Boolean) });
});

// GET /api/grades/monthly?month=2026-11&group=Python-3
gradesRouter.get("/monthly", async (req: AuthedRequest, res) => {
  const month = typeof req.query.month === "string" ? req.query.month : currentMonth();
  const data = await monthlyStats(req.teacherId!, month, groupParam(req.query.group));
  if (!data) {
    res.status(400).json({ error: "Oy noto'g'ri (YYYY-MM)" });
    return;
  }
  res.json(data);
});

// Ota-ona uchun havola tokeni (bitta o'quvchi)
gradesRouter.post("/parent-link", async (req: AuthedRequest, res) => {
  const nickname = typeof req.body?.nickname === "string" ? req.body.nickname.trim() : "";
  if (!nickname) {
    res.status(400).json({ error: "O'quvchi ismi kerak" });
    return;
  }
  res.json({ token: signParentToken(req.teacherId!, groupParam(req.body?.group), nickname) });
});

// ---- Ota-ona sahifasi (ochiq, token bilan) — faqat o'z farzandi ko'rinadi ----
export const parentRouter = Router();

parentRouter.get("/:token", async (req, res) => {
  const p = verifyParentToken(String(req.params.token));
  if (!p) {
    res.status(404).json({ error: "Havola yaroqsiz yoki eskirgan" });
    return;
  }
  const month = typeof req.query.month === "string" ? req.query.month : currentMonth();
  const data = await monthlyStats(p.t, month, p.g);
  if (!data) {
    res.status(400).json({ error: "Oy noto'g'ri" });
    return;
  }
  const me = data.students.find((s) => s.key === p.n) ?? null;
  const teacher = await prisma.teacher.findUnique({ where: { id: p.t }, select: { name: true } });
  // Boshqa bolalarning ism va ballari yuborilmaydi — faqat o'rin va guruh kattaligi
  res.json({
    month,
    group: p.g,
    teacher: teacher?.name ?? "",
    groupSize: data.students.length,
    groupAvg: data.students.length ? Math.round(data.students.reduce((a, s) => a + s.pct, 0) / data.students.length) : 0,
    student: me && {
      nickname: me.nickname,
      place: me.place,
      pct: me.pct,
      avg: me.avg,
      attended: me.attended,
      lessons: me.lessons,
      perLesson: me.perLesson.map((l) => {
        const g = data.lessons.find((x) => x.id === l.gameId)!;
        return { title: g.title, playedAt: g.playedAt, scores: l.scores };
      }),
    },
  });
});
