import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server } from "socket.io";
import { config } from "./config.js";
import { registerGameHandlers } from "./socket/game.js";
import { authRouter } from "./routes/auth.js";
import { quizRouter } from "./routes/quizzes.js";
import { pdfRouter } from "./routes/pdf.js";
import { excelRouter } from "./routes/excel.js";
import { importRouter } from "./routes/import.js";
import { uploadRouter, UPLOADS_DIR } from "./routes/upload.js";
import { reportRouter } from "./routes/reports.js";
import { publicRouter } from "./routes/public.js";
import { curriculumRouter } from "./routes/curriculum.js";
import { guideRouter } from "./routes/guide.js";
import { searchRouter } from "./routes/search.js";
import { teachersRouter } from "./routes/teachers.js";

const app = express();
app.set("trust proxy", 1); // nginx orqasida to'g'ri IP olish uchun

// Xavfsizlik header'lari. CSP hozircha o'chirilgan (SPA/Google fontlar/OAuth'ni
// buzmasligi uchun) — keyinchalik aniq sozlanadi. Rasmlar cross-origin yuklanadi.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS: dev'da LAN'dagi qurilmalar (origin aks ettiriladi); prod'da faqat CLIENT_URL
app.use(
  cors({
    origin: config.production ? [config.clientUrl] : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));

// ---- Rate limiting (brute-force / xarajat / DoS himoyasi) ----
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 15 daqiqada IP boshiga 30 urinish (login/register)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." },
});
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20, // soatiga 20 PDF→AI (Claude xarajati)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "AI generatsiyasi limiti. Birozdan keyin urinib ko'ring." },
});
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
// Tashqi quiz import (Wayground'ga chiquvchi so'rov) — suiiste'mol/yukni cheklash
const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 15 daqiqada IP boshiga 30 import
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Import limiti. Birozdan keyin qayta urinib ko'ring." },
});
// /uploads statik fayllarini brute-force yuklab olishdan himoyalash
// (To'liq auth — S3/MinIO ga o'tganda signed URL bilan hal qilinadi)
const uploadsStaticLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300, // daqiqada 300 ta rasm (o'yin paytida bir xonada 30 o'quvchi ~10 rasm)
  standardHeaders: true,
  legacyHeaders: false,
});
// Mualliflashtirilgan maxsus endpointlarga (auth router'idan oldin) qo'llanadi
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/google", authLimiter);
app.use("/api/pdf", aiLimiter);
app.use("/api/import", importLimiter);
app.use("/api/upload", uploadLimiter);

// Yuklangan fayllar (PDF sahifalari rasmlari) — inline, sniff'siz
// Rate-limited: ommaviy yuklab olishni cheklaydi
app.use(
  "/uploads",
  uploadsStaticLimiter,
  express.static(UPLOADS_DIR, {
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, max-age=86400"); // 1 kun kesh
    },
  }),
);

// Sog'liq tekshiruvi
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "robbit-quiz-backend" });
});

// API marshrutlari
app.use("/api/auth", authRouter);
app.use("/api/quizzes", quizRouter);
app.use("/api/pdf", pdfRouter);
app.use("/api/excel", excelRouter);
app.use("/api/import", importRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/reports", reportRouter);
app.use("/api/public", publicRouter);
app.use("/api/curriculum", curriculumRouter);
app.use("/api/guide", guideRouter);
app.use("/api/search", searchRouter);
app.use("/api/teachers", teachersRouter);

// Production: tayyor frontend'ni (statik) shu serverdan beramiz — bitta port, bitta origin
if (config.production) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // dist/index.js dan ../public ga: backend/public ichida frontend build turadi
  const staticDir = process.env.STATIC_DIR
    ? path.resolve(process.env.STATIC_DIR)
    : path.resolve(__dirname, "../public");
  app.use(express.static(staticDir));
  // SPA fallback — API/uploads/socket'dan boshqa GET so'rovlar index.html'ga
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path.startsWith("/socket.io")) {
      return next();
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
});

io.on("connection", (socket) => {
  registerGameHandlers(io, socket);
});

httpServer.listen(config.port, () => {
  console.log(`✅ Backend ishga tushdi: http://localhost:${config.port}`);
});

export { io };
