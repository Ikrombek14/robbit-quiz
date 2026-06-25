import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../auth.js";
import { generateQuestionsFromPdf } from "../services/claude.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

export const pdfRouter = Router();

// PDF yuklash -> AI savollar yaratadi -> ro'yxat qaytariladi (hali saqlanmaydi)
pdfRouter.post("/generate", requireAuth, upload.single("pdf"), async (req, res) => {
  const file = (req as unknown as { file?: { buffer: Buffer; mimetype: string } }).file;
  if (!file) {
    res.status(400).json({ error: "PDF fayl yuborilmadi" });
    return;
  }
  if (file.mimetype !== "application/pdf") {
    res.status(400).json({ error: "Faqat PDF fayl qabul qilinadi" });
    return;
  }
  const count = Math.min(Math.max(Number(req.body.count ?? 10) || 10, 1), 30);
  try {
    const base64 = file.buffer.toString("base64");
    const questions = await generateQuestionsFromPdf(base64, count);
    res.json({ questions });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "AI xatoligi" });
  }
});
