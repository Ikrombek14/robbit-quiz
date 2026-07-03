import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { prisma } from "../prisma.js";
import { getAllStats, getStatByName, statsUpdatedAt } from "../services/stats.js";
import { getAllAnalyses, getAnalysisByName } from "../services/analysis.js";

// Ustozlar statistikasi (Google Sheet'dan). Barcha kirgan ustozlar ko'ra oladi.
export const statsRouter = Router();
statsRouter.use(requireAuth);

// Joriy ustozning o'z statistikasi (ism bo'yicha topiladi) — bosh sahifadagi kataklar uchun
statsRouter.get("/me", async (req: AuthedRequest, res) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId }, select: { name: true } });
  if (!teacher) {
    res.json({ stat: null });
    return;
  }
  try {
    const stat = await getStatByName(teacher.name);
    res.json({ stat });
  } catch {
    res.json({ stat: null }); // statistika manbasi vaqtincha ishlamasa — sahifa baribir ochiladi
  }
});

// Barcha ustozlar statistikasi (reyting / to'liq ko'rish)
statsRouter.get("/all", async (_req, res) => {
  try {
    const stats = await getAllStats();
    res.json({ stats, updatedAt: statsUpdatedAt() });
  } catch {
    res.status(502).json({ error: "Statistikani yuklab bo'lmadi" });
  }
});

// Joriy ustozning faoliyat tahlili. ?months=3|6|12 — grafiklar davri
// (toifa talablari baribir oxirgi 3 oy bo'yicha hisoblanadi)
statsRouter.get("/analysis/me", async (req: AuthedRequest, res) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId }, select: { name: true } });
  if (!teacher) {
    res.json({ analysis: null });
    return;
  }
  const m = Number(req.query.months);
  const monthLimit = m === 6 ? 6 : m === 12 ? 12 : 3;
  try {
    const analysis = await getAnalysisByName(teacher.name, monthLimit);
    res.json({ analysis });
  } catch {
    res.json({ analysis: null }); // manba vaqtincha ishlamasa — sahifa baribir ochiladi
  }
});

// Barcha ustozlar tahlili — faqat admin (oddiy ustoz faqat o'zinikini ko'radi).
// ?months=3|6|12 — tanlangan ustozning grafiklari uchun davr
statsRouter.get("/analysis/all", async (req: AuthedRequest, res) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId }, select: { isAdmin: true } });
  if (!teacher?.isAdmin) {
    res.status(403).json({ error: "Bu bo'lim faqat admin uchun" });
    return;
  }
  const m = Number(req.query.months);
  const monthLimit = m === 6 ? 6 : m === 12 ? 12 : 3;
  try {
    const r = await getAllAnalyses(monthLimit);
    res.json(r);
  } catch {
    res.status(502).json({ error: "Tahlilni yuklab bo'lmadi" });
  }
});

// Majburiy yangilash (keshni chetlab Sheet'dan qayta oladi) — faqat admin
statsRouter.post("/refresh", async (req: AuthedRequest, res) => {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId }, select: { isAdmin: true } });
  if (!teacher?.isAdmin) {
    res.status(403).json({ error: "Bu amal faqat admin uchun" });
    return;
  }
  try {
    const stats = await getAllStats(true);
    res.json({ stats, updatedAt: statsUpdatedAt() });
  } catch {
    res.status(502).json({ error: "Statistikani yuklab bo'lmadi" });
  }
});
