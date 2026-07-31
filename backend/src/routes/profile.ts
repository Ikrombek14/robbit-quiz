import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireApproved, type AuthedRequest } from "../auth.js";
import { upload } from "./upload.js";

// Ustoz profili: rasm, telefon, sertifikatlar — toifa oshirish arizasida ham ishlatiladi.
export const profileRouter = Router();
profileRouter.use(requireAuth, requireApproved);

profileRouter.get("/me", async (req: AuthedRequest, res) => {
  const teacher = await prisma.teacher.findUnique({
    where: { id: req.teacherId },
    select: {
      phone: true,
      picture: true,
      certificates: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, fileUrl: true, createdAt: true } },
    },
  });
  if (!teacher) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  res.json(teacher);
});

const patchSchema = z.object({
  phone: z.string().trim().max(30).nullable().optional(),
  picture: z.string().trim().max(500).nullable().optional(),
});
profileRouter.patch("/me", async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const teacher = await prisma.teacher.update({ where: { id: req.teacherId }, data: parsed.data });
  res.json({ phone: teacher.phone, picture: teacher.picture });
});

// Rasm/sertifikat fayli yuklash -> URL qaytaradi (mavjud /api/upload'dan farqi — canCreate emas,
// har qanday tasdiqlangan ustoz o'z profilini to'ldira oladi)
profileRouter.post("/upload", upload.single("file"), (req, res) => {
  const file = (req as unknown as { file?: { filename: string } }).file;
  if (!file) {
    res.status(400).json({ error: "Fayl yuborilmadi" });
    return;
  }
  res.json({ url: `/uploads/${file.filename}` });
});

const certSchema = z.object({ title: z.string().trim().min(1).max(200), fileUrl: z.string().trim().min(1).max(500) });
profileRouter.post("/certificates", async (req: AuthedRequest, res) => {
  const parsed = certSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const cert = await prisma.teacherCertificate.create({
    data: { teacherId: req.teacherId!, title: parsed.data.title, fileUrl: parsed.data.fileUrl },
  });
  res.json({ certificate: cert });
});

profileRouter.delete("/certificates/:id", async (req: AuthedRequest, res) => {
  const r = await prisma.teacherCertificate.deleteMany({ where: { id: String(req.params.id), teacherId: req.teacherId } });
  if (r.count === 0) {
    res.status(404).json({ error: "Sertifikat topilmadi" });
    return;
  }
  res.json({ ok: true });
});
