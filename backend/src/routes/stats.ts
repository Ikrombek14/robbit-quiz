import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../auth.js";
import { prisma } from "../prisma.js";
import { getAllStats, getStatByName } from "../services/stats.js";

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
    res.json({ stats });
  } catch {
    res.status(502).json({ error: "Statistikani yuklab bo'lmadi" });
  }
});
