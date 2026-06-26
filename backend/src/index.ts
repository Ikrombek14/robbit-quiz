import express from "express";
import cors from "cors";
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
import { uploadRouter, UPLOADS_DIR } from "./routes/upload.js";
import { reportRouter } from "./routes/reports.js";
import { publicRouter } from "./routes/public.js";
import { curriculumRouter } from "./routes/curriculum.js";

const app = express();
// Dev'da LAN'dagi har qanday qurilma ulanishi uchun origin'ni aks ettiramiz
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

// Yuklangan fayllar (PDF sahifalari rasmlari)
app.use("/uploads", express.static(UPLOADS_DIR));

// Sog'liq tekshiruvi
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "robbit-quiz-backend" });
});

// API marshrutlari
app.use("/api/auth", authRouter);
app.use("/api/quizzes", quizRouter);
app.use("/api/pdf", pdfRouter);
app.use("/api/excel", excelRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/reports", reportRouter);
app.use("/api/public", publicRouter);
app.use("/api/curriculum", curriculumRouter);

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
