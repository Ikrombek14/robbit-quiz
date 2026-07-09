import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { requireAuth, requireCanCreate, type AuthedRequest } from "../auth.js";
import {
  generateQuestionsFromPdf,
  generateQuestionsFromSlides,
  type GeneratedQuestion,
  type SlideImage,
} from "../services/claude.js";
import { UPLOADS_DIR } from "./upload.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

export const pdfRouter = Router();

// PDF yuklash -> AI savollar yaratadi -> ro'yxat qaytariladi (hali saqlanmaydi)
pdfRouter.post("/generate", requireAuth, requireCanCreate, upload.single("pdf"), async (req, res) => {
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

// ---- Muharrirdagi slaydlar asosida AI savollar taklifi ----
// Frontend joriy (saqlanmagan bo'lishi ham mumkin) slaydlardan matnlar va rasm
// URL'larini yuboradi; rasmlar serverdagi uploads/ papkadan o'qiladi.
const fromSlidesSchema = z.object({
  count: z.number().int().min(1).max(30).default(10),
  texts: z.array(z.string()).max(200).default([]),
  images: z.array(z.string()).max(60).default([]),
  existing: z.array(z.string()).max(100).default([]), // takrorlanmasligi kerak bo'lgan mavjud savollar
});

const MEDIA_BY_EXT: Record<string, SlideImage["mediaType"]> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};
const MAX_IMAGES = 20; // AI so'roviga kiradigan rasmlar chegarasi (xarajat/limit)
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB dan katta rasm o'tkazib yuboriladi

// AI so'rovi 60s+ olishi mumkin — nginx/Cloudflare proxy javobni shuncha kutmaydi (502).
// Shuning uchun natija darhol emas: POST job ochadi (jobId qaytaradi), frontend GET bilan
// har 3 soniyada holatni so'raydi. Job'lar xotirada, 15 daqiqadan keyin tozalanadi.
interface AiJob {
  teacherId: string;
  status: "pending" | "done" | "error";
  questions?: GeneratedQuestion[];
  error?: string;
  usedImages: number;
  skippedImages: number;
  createdAt: number;
}
const aiJobs = new Map<string, AiJob>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of aiJobs) if (now - v.createdAt > 15 * 60 * 1000) aiJobs.delete(k);
}, 60_000).unref();

pdfRouter.post("/generate-from-slides", requireAuth, requireCanCreate, async (req: AuthedRequest, res) => {
  const parsed = fromSlidesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "So'rov formati noto'g'ri" });
    return;
  }
  const { count, texts, images, existing } = parsed.data;

  // Rasmlarni uploads/ dan o'qiymiz — faqat /uploads/<fayl> ko'rinishidagi URL'lar
  // (basename bilan path traversal'dan himoya)
  const slideImages: SlideImage[] = [];
  let skippedImages = 0;
  for (const url of images) {
    if (slideImages.length >= MAX_IMAGES) {
      skippedImages++;
      continue;
    }
    if (!url.startsWith("/uploads/")) continue;
    const base = path.basename(url);
    const mediaType = MEDIA_BY_EXT[path.extname(base).toLowerCase()];
    if (!mediaType) continue;
    const filePath = path.join(UPLOADS_DIR, base);
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > MAX_IMAGE_BYTES) {
        skippedImages++;
        continue;
      }
      slideImages.push({ mediaType, base64: fs.readFileSync(filePath).toString("base64") });
    } catch {
      skippedImages++; // fayl topilmadi — o'tkazib yuboramiz
    }
  }

  const cleanTexts = texts.map((t) => t.trim()).filter(Boolean).slice(0, 100);
  if (slideImages.length === 0 && cleanTexts.length === 0) {
    res.status(400).json({ error: "Slaydlarda AI o'qiy oladigan mazmun topilmadi. Avval kontent slaydlar (PDF sahifalari yoki matn) qo'shing." });
    return;
  }

  // Job ochamiz va darhol javob qaytaramiz — AI fon'da ishlaydi
  const jobId = `j${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  const job: AiJob = {
    teacherId: req.teacherId!,
    status: "pending",
    usedImages: slideImages.length,
    skippedImages,
    createdAt: Date.now(),
  };
  aiJobs.set(jobId, job);
  generateQuestionsFromSlides(slideImages, cleanTexts, existing, count)
    .then((questions) => {
      job.status = "done";
      job.questions = questions;
    })
    .catch((e) => {
      job.status = "error";
      job.error = e instanceof Error ? e.message : "AI xatoligi";
    });
  res.json({ jobId });
});

// Job holatini so'rash (polling). GET — aiLimiter'ga kirmaydi (index.ts'da skip).
pdfRouter.get("/generate-from-slides/:jobId", requireAuth, requireCanCreate, (req: AuthedRequest, res) => {
  const job = aiJobs.get(String(req.params.jobId));
  if (!job || job.teacherId !== req.teacherId) {
    res.status(404).json({ error: "So'rov topilmadi yoki eskirgan. Qayta urinib ko'ring." });
    return;
  }
  if (job.status === "pending") {
    res.json({ status: "pending" });
    return;
  }
  if (job.status === "error") {
    res.json({ status: "error", error: job.error });
    return;
  }
  res.json({ status: "done", questions: job.questions ?? [], usedImages: job.usedImages, skippedImages: job.skippedImages });
});
