import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { requireAuth, requireCanCreate, requireAdmin } from "../auth.js";

export const UPLOADS_DIR = path.resolve("uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

export const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

export const uploadRouter = Router();

// Rasm (PDF sahifasi) yuklash -> URL qaytaradi
uploadRouter.post("/", requireAuth, requireCanCreate, upload.single("file"), (req, res) => {
  const file = (req as unknown as { file?: { filename: string } }).file;
  if (!file) {
    res.status(400).json({ error: "Fayl yuborilmadi" });
    return;
  }
  res.json({ url: `/uploads/${file.filename}` });
});

// Media (rasm YOKI video) yuklash — amaliyot bo'limi uchun. Faqat admin.
// Hajm chegarasi 50MB — nginx client_max_body_size (50M) bilan mos. Faqat image/* va video/*.
const MEDIA_MAX = 50 * 1024 * 1024;
const mediaUpload = multer({
  storage,
  limits: { fileSize: MEDIA_MAX },
  fileFilter: (_req, file, cb) => {
    if (/^(image|video)\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Faqat rasm yoki video yuklash mumkin"));
  },
});
uploadRouter.post(
  "/media",
  requireAuth,
  requireAdmin,
  (req: Request, res: Response, next: NextFunction) => {
    mediaUpload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error && err.message.includes("File too large")
          ? "Fayl juda katta (50MB gacha)"
          : err instanceof Error ? err.message : "Yuklashda xatolik";
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
  },
  (req, res) => {
    const file = (req as unknown as { file?: { filename: string; mimetype: string } }).file;
    if (!file) {
      res.status(400).json({ error: "Fayl yuborilmadi" });
      return;
    }
    res.json({ url: `/uploads/${file.filename}`, mime: file.mimetype });
  },
);
