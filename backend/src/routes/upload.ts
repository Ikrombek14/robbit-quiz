import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { requireAuth, requireCanCreate } from "../auth.js";

export const UPLOADS_DIR = path.resolve("uploads");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

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
