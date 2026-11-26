import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { CRITERIA, type Criterion, type Scores, computeScores, densePlaces, monthRange, nameKey, parseGrades } from "./grades.js";

// ---- Oylik statistika: ustozning bir oydagi darslari (GameRecord) bo'yicha o'quvchilar reytingi ----
//
// O'quvchi ism bo'yicha birlashtiriladi (nameKey). Guruh tanlangan bo'lsa, shu guruhdagi
// har dars hisobga olinadi va o'quvchi kelmagan dars = davomat 0, jami 0% (kelmagani ham baho).
// Guruh tanlanmasa — faqat o'quvchi qatnashgan darslar.

export interface LessonRef {
  id: string;
  title: string;
  playedAt: Date;
}
export interface StudentMonth {
  key: string;
  nickname: string;
  attended: number; // qatnashgan darslar soni
  lessons: number; // hisobga olingan darslar soni
  avg: Record<Criterion, number | null>; // mezonlar bo'yicha o'rtacha (0–100)
  pct: number; // darslar jami foizining o'rtachasi
  place: number;
  perLesson: { gameId: string; scores: Scores | null }[]; // null = kelmagan
}

const ABSENT: Scores = { attendance: 0, homework: null, quiz: null, practice1: null, practice2: null, behavior: 0, total: 0, max: 100, pct: 0 };

export async function monthlyStats(teacherId: string, month: string, group: string | null) {
  const range = monthRange(month);
  if (!range) return null;
  const games = await prisma.gameRecord.findMany({
    where: {
      teacherId,
      playedAt: { gte: range.from, lt: range.to },
      ...(group ? { groupName: group } : {}),
    },
    orderBy: { playedAt: "asc" },
    include: { players: { select: { nickname: true, grades: true } } },
  });
  const lessons: LessonRef[] = games.map((g) => ({ id: g.id, title: g.title, playedAt: g.playedAt }));

  const map = new Map<string, { nickname: string; byGame: Map<string, Scores> }>();
  for (const g of games) {
    for (const p of g.players) {
      const k = nameKey(p.nickname);
      if (!k) continue;
      const e = map.get(k) ?? { nickname: p.nickname.trim(), byGame: new Map() };
      // Bir darsda bir ism ikki marta bo'lsa (qayta kirish) — yuqori natija olinadi
      const s = computeScores(parseGrades(p.grades));
      const old = e.byGame.get(g.id);
      if (!old || s.pct > old.pct) e.byGame.set(g.id, s);
      map.set(k, e);
    }
  }

  const students: StudentMonth[] = [...map.entries()].map(([key, e]) => {
    const perLesson = games
      .filter((g) => group || e.byGame.has(g.id))
      .map((g) => ({ gameId: g.id, scores: e.byGame.get(g.id) ?? null }));
    const list = perLesson.map((l) => l.scores ?? ABSENT);
    const avg = {} as Record<Criterion, number | null>;
    for (const c of CRITERIA) {
      const vals = list.map((s) => s[c]).filter((v): v is number => v !== null);
      avg[c] = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    }
    const pct = list.length ? Math.round(list.reduce((a, s) => a + s.pct, 0) / list.length) : 0;
    return { key, nickname: e.nickname, attended: e.byGame.size, lessons: list.length, avg, pct, place: 0, perLesson };
  });
  students.sort((a, b) => b.pct - a.pct || a.nickname.localeCompare(b.nickname));
  const places = densePlaces(students.map((s) => s.pct));
  students.forEach((s, i) => (s.place = places[i]));
  return { month, group, lessons, students };
}

// ---- Ota-ona havolasi: imzolangan token (faqat bitta bola, bitta guruh) ----

interface ParentPayload {
  t: string; // teacherId
  g: string | null; // guruh
  n: string; // o'quvchi ism kaliti
  k: "parent";
}

export function signParentToken(teacherId: string, group: string | null, nickname: string): string {
  const payload: ParentPayload = { t: teacherId, g: group, n: nameKey(nickname), k: "parent" };
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "400d" });
}

export function verifyParentToken(token: string): ParentPayload | null {
  try {
    const p = jwt.verify(token, config.jwtSecret) as ParentPayload;
    return p?.k === "parent" && typeof p.t === "string" && typeof p.n === "string" ? p : null;
  } catch {
    return null;
  }
}
