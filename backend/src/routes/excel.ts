import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { requireAuth } from "../auth.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

export const excelRouter = Router();

/* eslint-disable @typescript-eslint/no-explicit-any */

// Quizizz/Wayground shablonidagi savol turlari → bizning QType
// Multiple Choice → SINGLE, Checkbox → MULTIPLE, Poll → POLL,
// Fill-in-the-Blank → OPEN (javoblar variantlardan), Open-Ended/Draw → OPEN (baholanmaydi)
function mapType(raw: string): { kind: "QUESTION"; type: string } {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t.startsWith("checkbox") || t.includes("multiple select")) return { kind: "QUESTION", type: "MULTIPLE" };
  if (t.startsWith("poll")) return { kind: "QUESTION", type: "POLL" };
  if (t.startsWith("fill")) return { kind: "QUESTION", type: "OPEN" };
  if (t.startsWith("open") || t.startsWith("draw")) return { kind: "QUESTION", type: "OPEN" };
  // default
  return { kind: "QUESTION", type: "SINGLE" };
}

function clampTime(v: any): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(Math.max(n, 5), 300);
}

// "4" yoki "4.0" yoki "1,2,3" → 0-asosli indekslar to'plami
function parseCorrect(raw: any): Set<number> {
  const out = new Set<number>();
  String(raw ?? "")
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((s) => {
      const n = Math.round(Number(s));
      if (Number.isFinite(n) && n >= 1) out.add(n - 1);
    });
  return out;
}

excelRouter.post("/import", requireAuth, upload.single("file"), (req, res) => {
  const file = (req as unknown as { file?: { buffer: Buffer; originalname: string } }).file;
  if (!file) {
    res.status(400).json({ error: "Excel fayl yuborilmadi" });
    return;
  }
  let rows: any[][];
  try {
    const wb = XLSX.read(file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: "" });
  } catch {
    res.status(400).json({ error: "Excel faylni o'qib bo'lmadi" });
    return;
  }

  // Sarlavha qatorini topamiz (Question Text bo'lgan qator)
  let headerIdx = rows.findIndex((r) => String(r?.[0] ?? "").trim().toLowerCase().startsWith("question text"));
  if (headerIdx === -1) headerIdx = 0;

  const slides: any[] = [];
  const summary = { total: 0, single: 0, multiple: 0, poll: 0, written: 0, skipped: 0 };

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const text = String(r[0] ?? "").trim();
    // Yo'riqnoma qatori yoki bo'sh qatorni o'tkazib yuboramiz
    if (!text || text.toLowerCase().startsWith("text of the question")) {
      continue;
    }

    const { type } = mapType(r[1]);
    const rawOptions = [r[2], r[3], r[4], r[5], r[6]].map((o) => String(o ?? "").trim());
    const options = rawOptions.filter((o) => o.length > 0);
    const correctSet = parseCorrect(r[7]);
    const timeLimit = clampTime(r[8]);
    const imageUrl = String(r[9] ?? "").trim();
    const explanation = String(r[10] ?? "").trim();

    const base: any = {
      kind: "QUESTION",
      type,
      notes: explanation || null,
      timeLimit,
      points: 1000,
    };

    if (type === "OPEN") {
      // Fill-in-the-Blank → variantlar qabul qilinadigan javoblar; Open-Ended → bo'sh (baholanmaydi)
      slides.push({
        ...base,
        data: { text, imageUrl, answers: options },
      });
      summary.written++;
    } else if (type === "POLL") {
      slides.push({
        ...base,
        data: { text, imageUrl, options: options.map((o) => ({ text: o, isCorrect: false })) },
      });
      summary.poll++;
    } else {
      // SINGLE / MULTIPLE
      if (options.length < 2) {
        summary.skipped++;
        continue;
      }
      const opts = options.map((o, idx) => ({ text: o, isCorrect: correctSet.has(idx) }));
      // Hech bo'lmaganda bitta to'g'ri javob bo'lsin
      if (!opts.some((o) => o.isCorrect)) opts[0].isCorrect = true;
      slides.push({ ...base, data: { text, imageUrl, options: opts } });
      if (type === "MULTIPLE") summary.multiple++;
      else summary.single++;
    }
    summary.total++;
  }

  if (slides.length === 0) {
    res.status(400).json({ error: "Faylda savollar topilmadi. Shablon to'g'riligini tekshiring." });
    return;
  }

  res.json({ slides, summary });
});
