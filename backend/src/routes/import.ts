import { Router } from "express";
import { requireAuth } from "../auth.js";

export const importRouter = Router();

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ============================================================
   Wayground (Quizizz) public quiz/presentation import.
   Foydalanuvchi admin/presentation yoki quiz havolasini beradi →
   biz ID'ni ajratib, ochiq (public) ma'lumot API'sidan JSON olamiz.

   Wayground "questions" massivida IKKI xil element bor:
     • SLIDEV2 — tayyor kontent slayd (kanvas elementlari: TEXT/MEDIA),
       transform 1280×720 kanvasda → bizning CONTENT slaydga 1:1 mos.
     • MCQ/MSQ/... — savollar → bizning QUESTION slaydlariga.

   API: https://wayground.com/_quizserver/main/v2/quiz/{ID}
   Eslatma: rasmiy hujjatlashtirilmagan; faqat ochiq (public)
   quizlar tokensiz qaytadi. Private bo'lsa 403.
   ============================================================ */

const STAGE_W = 1280;
const STAGE_H = 720;
const INK = "#3c3633";

let _seq = 0;
function eid(): string {
  _seq += 1;
  return `wg${Date.now().toString(36)}${_seq}`;
}

// Havoladan 24-belgili Mongo ObjectId (quiz/presentation ID) ni ajratamiz
function extractQuizId(input: string): string | null {
  const s = String(input ?? "").trim();
  if (/^[a-f0-9]{24}$/i.test(s)) return s;
  const matches = s.match(/[a-f0-9]{24}/gi);
  if (matches && matches.length) return matches[matches.length - 1];
  return null;
}

// HTML teglarni tozalab, asosiy entity'larni ochamiz
function stripHtml(raw: any): string {
  let t = String(raw ?? "");
  t = t.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|h[1-6]|div)>/gi, "\n");
  t = t.replace(/<[^>]+>/g, "");
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/​/g, ""); // zero-width space (Wayground matnlarida uchraydi)
  return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function clampTime(ms: any, fallback = 30): number {
  let n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  if (n > 1000) n = n / 1000; // ms → s
  n = Math.round(n);
  return Math.min(Math.max(n, 5), 300);
}

// query/option ichidagi birinchi rasm URL'ini olamiz
function firstImage(node: any): string {
  const media = node?.media;
  if (Array.isArray(media)) {
    for (const m of media) {
      const url = m?.url || m?.meta?.url || (typeof m === "string" ? m : "");
      if (url && /^https?:\/\//i.test(url)) return String(url);
    }
  }
  return "";
}

function optionText(o: any): string {
  if (o == null) return "";
  if (typeof o === "string") return stripHtml(o);
  return stripHtml(o.text ?? o.label ?? o.value ?? "");
}

/* --------- Kontent slayd (SLIDEV2) → CONTENT --------- */

function htmlAttr(html: string, re: RegExp, def: string): string {
  const m = String(html ?? "").match(re);
  return m ? m[1] : def;
}

function buildTextElement(e: any): any {
  const html = e?.data?.html ?? e?.data?.text ?? "";
  const text = stripHtml(html);
  const tr = e?.transform ?? {};
  const size = Number(htmlAttr(html, /font-size:\s*(\d+)px/i, "")) || Number(e?.placeholderSize) || 32;
  const color = htmlAttr(html, /(?:^|[^-])color:\s*(#[0-9a-fA-F]{3,8})/i, INK);
  const align = htmlAttr(html, /text-align:\s*(left|center|right)/i, "left").toLowerCase();
  const bold = /<strong|<b[\s>]|font-weight:\s*(?:bold|[6-9]00)/i.test(html);
  const italic = /<em[\s>]|<i[\s>]|font-style:\s*italic/i.test(html);
  const isHeading = /<h[1-3]/i.test(html);
  return {
    id: eid(),
    type: "text",
    x: Math.round(tr?.position?.x ?? 0),
    y: Math.round(tr?.position?.y ?? 0),
    w: Math.round(tr?.size?.width ?? 400),
    h: Math.round(tr?.size?.height ?? 80),
    rotation: Number(tr?.rotation ?? 0),
    z: Number(e?.zIndex ?? tr?.zIndex ?? 0),
    text,
    font: isHeading ? "Quicksand" : "Inter",
    size,
    color,
    bold: bold || undefined,
    italic: italic || undefined,
    align,
    valign: "top",
  };
}

function buildImageElement(e: any): any | null {
  const url = e?.data?.media?.url || e?.data?.url || "";
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const tr = e?.transform ?? {};
  const x = Math.round(tr?.position?.x ?? 0);
  const y = Math.round(tr?.position?.y ?? 0);
  const w = Math.round(tr?.size?.width ?? 300);
  const h = Math.round(tr?.size?.height ?? 300);
  // Kanvasni to'liq qoplaydigan rasm → cover (fon), aks holda contain
  const fullBg = x <= 0 && y <= 0 && w >= STAGE_W && h >= STAGE_H;
  return {
    id: eid(),
    type: "image",
    x,
    y,
    w,
    h,
    rotation: Number(tr?.rotation ?? 0),
    z: Number(e?.zIndex ?? tr?.zIndex ?? 0),
    url: String(url),
    fit: fullBg ? "cover" : "contain",
  };
}

function mapSlideV2(q: any): any | null {
  const st = q?.structure ?? {};
  const rawEls: any[] = Array.isArray(st?.elements) ? st.elements : [];
  const elements: any[] = [];
  for (const e of rawEls) {
    const t = String(e?.type ?? "").toUpperCase();
    if (t === "TEXT") {
      const te = buildTextElement(e);
      if (te.text) elements.push(te);
    } else if (t === "MEDIA" || t === "IMAGE") {
      const ie = buildImageElement(e);
      if (ie) elements.push(ie);
    }
    // SHAPE va boshqalar — hozircha o'tkazib yuboriladi (keyin qo'shsa bo'ladi)
  }
  if (elements.length === 0) return null;

  const bgColor = st?.theme?.background?.color || "#ffffff";
  return {
    kind: "CONTENT",
    type: null,
    notes: null,
    timeLimit: 20,
    points: 0,
    data: {
      v: 2,
      background: { type: "color", value: String(bgColor) },
      elements,
    },
  };
}

/* --------- Savol turlari --------- */

function mapQuestionType(raw: any): string {
  const t = String(raw ?? "").trim().toUpperCase();
  switch (t) {
    case "MCQ":
      return "SINGLE";
    case "MSQ":
    case "CHECKBOX":
      return "MULTIPLE";
    case "POLL":
      return "POLL";
    case "BLANK":
    case "TYPING":
    case "FILL":
      return "FILL_BLANK";
    case "OPEN":
    case "OPENENDED":
    case "DRAW":
    case "AUDIO":
    case "VIDEO":
      return "OPEN";
    case "MATCH":
      return "MATCH";
    case "REORDER":
    case "DND":
    case "DRAGNDROP":
      return "REORDER";
    default:
      return "SINGLE";
  }
}

function answerIndices(answer: any): Set<number> {
  const out = new Set<number>();
  if (answer == null) return out;
  const arr = Array.isArray(answer) ? answer : [answer];
  for (const a of arr) {
    const n = Math.round(Number(a));
    if (Number.isFinite(n) && n >= 0) out.add(n);
  }
  return out;
}

function mapQuestion(q: any): any | null {
  const st = q?.structure ?? q;
  if (!st) return null;
  const type = mapQuestionType(q?.type ?? st?.kind);
  const text = stripHtml(st?.query?.text ?? st?.query ?? q?.text ?? "");
  const imageUrl = firstImage(st?.query);
  const explanation = stripHtml(st?.explain?.text ?? st?.explanation ?? "");
  const rawOptions: any[] = Array.isArray(st?.options) ? st.options : [];

  const base: any = {
    kind: "QUESTION",
    type,
    notes: explanation || null,
    timeLimit: clampTime(q?.time ?? st?.time),
    points: 1000,
  };

  if (type === "OPEN") {
    const answers = rawOptions.map(optionText).filter(Boolean);
    return { ...base, data: { text, imageUrl, answers } };
  }
  if (type === "FILL_BLANK") {
    const answers = rawOptions.map(optionText).filter(Boolean);
    return { ...base, data: { text, imageUrl, blanks: answers.length ? [answers] : [[]], answers } };
  }
  if (type === "POLL") {
    const options = rawOptions
      .map((o) => ({ text: optionText(o), isCorrect: false, imageUrl: firstImage(o) || undefined }))
      .filter((o) => o.text || o.imageUrl);
    return { ...base, data: { text, imageUrl, options } };
  }
  if (type === "MATCH") {
    const pairs = rawOptions
      .map((o: any) => ({ left: stripHtml(o?.text ?? o?.left ?? ""), right: stripHtml(o?.match ?? o?.right ?? "") }))
      .filter((p) => p.left || p.right);
    return { ...base, data: { text, imageUrl, pairs } };
  }
  if (type === "REORDER") {
    const items = rawOptions.map(optionText).filter(Boolean);
    return { ...base, data: { text, imageUrl, items } };
  }

  // SINGLE / MULTIPLE
  const correct = answerIndices(st?.answer);
  const options = rawOptions
    .map((o: any, idx: number) => ({
      text: optionText(o),
      isCorrect: correct.has(idx) || o?.isCorrect === true || o?.correct === true,
      imageUrl: firstImage(o) || undefined,
    }))
    .filter((o) => o.text || o.imageUrl);

  if (options.length < 2) return null;
  if (!options.some((o) => o.isCorrect)) options[0].isCorrect = true;
  return { ...base, data: { text, imageUrl, options } };
}

// Element kontent slaydmi yoki savolmi — ajratamiz
function isContentSlide(q: any): boolean {
  const t = String(q?.type ?? q?.structure?.kind ?? "").toUpperCase();
  if (t.startsWith("SLIDE")) return true; // SLIDEV2, SLIDE
  if (t === "CONTENT" || t === "READING") return true;
  return false;
}

// Wayground javob JSON'ini bizning {title, slides, summary} formatiga aylantiramiz.
// (Route'dan ajratilgan — test qilish oson bo'lishi uchun.)
export function mapQuizResponse(json: any): { title: string; slides: any[]; summary: any } | null {
  const quiz = json?.data?.quiz ?? json?.quiz ?? json?.data ?? json;
  const questions: any[] = quiz?.info?.questions ?? quiz?.questions ?? [];
  if (!Array.isArray(questions) || questions.length === 0) return null;

  const slides: any[] = [];
  const summary = { total: 0, content: 0, single: 0, multiple: 0, poll: 0, open: 0, other: 0, skipped: 0 };

  for (const q of questions) {
    const slide = isContentSlide(q) ? mapSlideV2(q) : mapQuestion(q);
    if (!slide) {
      summary.skipped++;
      continue;
    }
    slides.push(slide);
    summary.total++;
    if (slide.kind === "CONTENT") {
      summary.content++;
      continue;
    }
    switch (slide.type) {
      case "SINGLE":
        summary.single++;
        break;
      case "MULTIPLE":
        summary.multiple++;
        break;
      case "POLL":
        summary.poll++;
        break;
      case "OPEN":
      case "FILL_BLANK":
        summary.open++;
        break;
      default:
        summary.other++;
    }
  }

  return { title: stripHtml(quiz?.info?.name ?? quiz?.name ?? ""), slides, summary };
}

importRouter.post("/wayground", requireAuth, async (req, res) => {
  const { url } = (req.body ?? {}) as { url?: string };
  const id = extractQuizId(url ?? "");
  if (!id) {
    res.status(400).json({ error: "Havoladan quiz ID topilmadi. To'g'ri Wayground havolasini joylang." });
    return;
  }

  const apiUrl = `https://wayground.com/_quizserver/main/v2/quiz/${id}`;
  let json: any;
  try {
    const r = await fetch(apiUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    });
    if (r.status === 403 || r.status === 401) {
      res.status(403).json({
        error: "Bu quiz yopiq (private). Wayground'da uni 'public/shared' qilib qo'ying yoki ochiq havola bering.",
      });
      return;
    }
    if (!r.ok) {
      res.status(502).json({ error: `Wayground javob bermadi (HTTP ${r.status}).` });
      return;
    }
    json = await r.json();
  } catch {
    res.status(502).json({ error: "Wayground'ga ulanib bo'lmadi. Internet yoki havolani tekshiring." });
    return;
  }

  if (json?.success === false) {
    res.status(403).json({ error: "Quizga kirish ruxsati yo'q yoki havola noto'g'ri." });
    return;
  }

  const result = mapQuizResponse(json);
  if (!result) {
    res.status(404).json({ error: "Havolada slayd yoki savol topilmadi." });
    return;
  }
  if (result.slides.length === 0) {
    res.status(422).json({ error: "Slayd/savollarni o'girib bo'lmadi (format mos kelmadi)." });
    return;
  }
  res.json(result);
});
