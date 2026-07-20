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
import { generateQuestionsFromSlidesGemini, extractLessonTopicGemini } from "../services/gemini.js";
import { fetchExternalImage } from "../services/externalImages.js";
import { config } from "../config.js";
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
const MAX_TOTAL_IMAGE_BYTES = 13 * 1024 * 1024; // jami ~13 MB (Gemini so'rov limiti ~20MB, base64 +33%)

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
  skipReasons: string[]; // rasm o'tkazib yuborilish sabablari (diagnostika)
  createdAt: number;
}
const aiJobs = new Map<string, AiJob>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of aiJobs) if (now - v.createdAt > 15 * 60 * 1000) aiJobs.delete(k);
}, 60_000).unref();

// Rasm URL'laridan AI'ga beriladigan base64 to'plamni yig'adi.
// Ikki manba: /uploads/<fayl> — serverdagi fayl (sinxron o'qiladi),
// https://... — tashqi CDN (Wayground importidan qolgan) — yuklab olinadi.
// Job ichida (async) chaqiriladi — tashqi yuklab olish so'rov javobini kechiktirmasin.
async function collectSlideImages(urls: string[], job: AiJob): Promise<SlideImage[]> {
  const out: SlideImage[] = [];
  let totalBytes = 0;
  for (const url of urls) {
    if (out.length >= MAX_IMAGES || totalBytes >= MAX_TOTAL_IMAGE_BYTES) {
      job.skippedImages++;
      continue;
    }
    if (url.startsWith("/uploads/")) {
      // basename bilan path traversal'dan himoya
      const base = path.basename(url);
      const mediaType = MEDIA_BY_EXT[path.extname(base).toLowerCase()];
      if (!mediaType) continue;
      const filePath = path.join(UPLOADS_DIR, base);
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_IMAGE_BYTES || totalBytes + stat.size > MAX_TOTAL_IMAGE_BYTES) {
          job.skippedImages++;
          job.skipReasons.push("hajmi katta");
          continue;
        }
        totalBytes += stat.size;
        out.push({ mediaType, base64: fs.readFileSync(filePath).toString("base64") });
      } catch {
        job.skippedImages++; // fayl topilmadi — o'tkazib yuboramiz
        job.skipReasons.push("fayl topilmadi");
      }
    } else if (url.startsWith("https://")) {
      const img = await fetchExternalImage(url, MAX_IMAGE_BYTES);
      if (!img.ok) {
        job.skippedImages++;
        job.skipReasons.push(img.reason);
        console.warn(`[ai] tashqi rasm o'qilmadi (${img.reason}): ${url.slice(0, 120)}`);
        continue;
      }
      if (totalBytes + img.buffer.byteLength > MAX_TOTAL_IMAGE_BYTES) {
        job.skippedImages++;
        job.skipReasons.push("umumiy hajm to'ldi");
        continue;
      }
      totalBytes += img.buffer.byteLength;
      out.push({ mediaType: img.mediaType, base64: img.buffer.toString("base64") });
    }
  }
  job.usedImages = out.length;
  return out;
}

pdfRouter.post("/generate-from-slides", requireAuth, requireCanCreate, async (req: AuthedRequest, res) => {
  const parsed = fromSlidesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "So'rov formati noto'g'ri" });
    return;
  }
  const { count, texts, images, existing } = parsed.data;

  const imageUrls = images.filter((u) => u.startsWith("/uploads/") || u.startsWith("https://"));
  const cleanTexts = texts.map((t) => t.trim()).filter(Boolean).slice(0, 100);
  if (imageUrls.length === 0 && cleanTexts.length === 0) {
    res.status(400).json({ error: "Slaydlarda AI o'qiy oladigan mazmun topilmadi. Avval kontent slaydlar (PDF sahifalari yoki matn) qo'shing." });
    return;
  }

  // Job ochamiz va darhol javob qaytaramiz — rasm yig'ish ham, AI ham fon'da ishlaydi
  const jobId = `j${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
  const job: AiJob = {
    teacherId: req.teacherId!,
    status: "pending",
    usedImages: 0,
    skippedImages: 0,
    skipReasons: [],
    createdAt: Date.now(),
  };
  aiJobs.set(jobId, job);
  // Provayder tanlovi: GEMINI_API_KEY bo'lsa Gemini (tekin reja), aks holda Claude
  const generate = config.geminiApiKey ? generateQuestionsFromSlidesGemini : generateQuestionsFromSlides;
  collectSlideImages(imageUrls, job)
    .then((slideImages) => {
      if (slideImages.length === 0 && cleanTexts.length === 0) {
        // Sabablarni xabarga qo'shamiz — muammoni uzoqdan aniqlash oson bo'lsin
        const reasons = [...new Set(job.skipReasons)].slice(0, 3).join("; ");
        throw new Error(`Slayd rasmlarini o'qib bo'lmadi${reasons ? ` (${reasons})` : ""}. Qayta urinib ko'ring.`);
      }
      return generate(slideImages, cleanTexts, existing, count);
    })
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

// ---- PDF import: birinchi sahifa rasmidan dars mavzusini o'qish ----
// Muharrirda PDF yuklanganda quiz nomini avtomatik shu mavzuga o'rnatish uchun.
// Yagona kichik rasm — sinxron (job/polling shart emas, extractLessonTopicGemini
// curriculum.ts'da ham xuddi shu tarzda to'g'ridan kutiladi).
const extractTopicSchema = z.object({ image: z.string().min(1).max(2000) }); // /uploads/<fayl>
pdfRouter.post("/extract-topic", requireAuth, requireCanCreate, async (req: AuthedRequest, res) => {
  const parsed = extractTopicSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.image.startsWith("/uploads/")) {
    res.status(400).json({ error: "So'rov formati noto'g'ri" });
    return;
  }
  if (!config.geminiApiKey) {
    res.json({ topic: null }); // AI sozlanmagan — jim o'tkazib yuboramiz, filename fallback ishlayveradi
    return;
  }
  const base = path.basename(parsed.data.image); // path traversal himoyasi
  const mediaType = MEDIA_BY_EXT[path.extname(base).toLowerCase()];
  if (!mediaType) {
    res.json({ topic: null });
    return;
  }
  try {
    const filePath = path.join(UPLOADS_DIR, base);
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_IMAGE_BYTES) {
      res.json({ topic: null });
      return;
    }
    const base64 = fs.readFileSync(filePath).toString("base64");
    const topic = await extractLessonTopicGemini({ mediaType, base64 });
    res.json({ topic });
  } catch {
    res.json({ topic: null }); // AI/fayl xatosi — muharrirni bloklamaymiz, filename fallback qoladi
  }
});
