// Darsni AI bilan TO'LIQ tahlil qilish: quizning barcha slayd matnlari +
// birinchi slayd (titul) rasmi o'rganilib, quyidagilar aniqlanadi:
//   - mavzu  — toza dars nomi (prefikssiz, qo'shtirnoqsiz)
//   - modul  — guruhning kanonik modul ro'yxatidan biri (tartiblash uchun)
//   - seq    — modul ichidagi taxminiy o'rin
//   - ishonch — 0-100 (nom faqat >=85 da qo'llanadi)
//
// Dvigatel: Claude Haiku (asosiy — tez, parallel ishlaydi), Gemini (zaxira).
// Middle (9-11) darslarini birinchi tartiblashda xuddi shu yondashuv 95%+
// aniqlik bergan (2026-07-16).

import fs from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { UPLOADS_DIR } from "../routes/upload.js";
import { requestGeminiText } from "./gemini.js";
import { modulesFor, type OrderGroup } from "./curriculumOrder.js";

export interface LessonAnalysis {
  mavzu: string | null;
  modul: string | null;
  seq: number | null;
  ishonch: number;
  manba: string; // "rasm" | "matn" | "taxmin" | xato tavsifi
  engine: "claude" | "gemini" | null;
}

interface SlideImagePart {
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}

function mimeFor(file: string): SlideImagePart["mediaType"] {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  return "image/webp";
}

// Slayd data'sidagi barcha mazmunli matnlar (kanvas elementlari, savol matni,
// variantlar, juftliklar...) — AI uchun dayjest
function slideTexts(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (t: unknown) => {
    const s = String(t ?? "").replace(/\s+/g, " ").trim();
    if (s.length >= 2) out.push(s);
  };
  const elements = data.elements;
  if (Array.isArray(elements)) {
    for (const e of elements) {
      if (e && typeof e === "object" && (e as { type?: string }).type === "text") {
        push((e as { text?: unknown }).text);
      }
    }
  }
  push(data.title); push(data.body); push(data.text);
  if (Array.isArray(data.options)) for (const o of data.options) push((o as { text?: unknown })?.text);
  if (Array.isArray(data.items)) for (const it of data.items) push(it);
  if (Array.isArray(data.pairs)) {
    for (const p of data.pairs) {
      push((p as { left?: unknown })?.left);
      push((p as { right?: unknown })?.right);
    }
  }
  return out;
}

// Dastlabki 3 slayd ichidan birinchi lokal (uploads) rasm — titul sahifa
async function firstImage(slides: { data: string }[]): Promise<SlideImagePart | null> {
  for (const s of slides.slice(0, 3)) {
    let data: Record<string, unknown>;
    try { data = JSON.parse(s.data) as Record<string, unknown>; } catch { continue; }
    const urls: string[] = [];
    const elements = data.elements;
    if (Array.isArray(elements)) {
      for (const e of elements) {
        const el = e as { type?: string; url?: unknown };
        if (el?.type === "image" && typeof el.url === "string") urls.push(el.url);
      }
    }
    if (typeof data.imageUrl === "string") urls.push(data.imageUrl);
    for (const u of urls) {
      if (!u.startsWith("/uploads/")) continue;
      const base = path.basename(u); // path traversal himoyasi
      try {
        const buf = await fs.readFile(path.join(UPLOADS_DIR, base));
        if (buf.length > 4.5 * 1024 * 1024) continue;
        return { base64: buf.toString("base64"), mediaType: mimeFor(base) };
      } catch {
        /* fayl topilmadi — keyingisini sinaymiz */
      }
    }
  }
  return null;
}

// Matndan birinchi balanslangan {...} JSON obyektini ajratadi (ortiqcha matnga chidamli)
function firstJson(text: string): Record<string, unknown> | null {
  const i = text.indexOf("{");
  if (i < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(text.slice(i, j + 1)) as Record<string, unknown>; }
          catch { return null; }
        }
      }
    }
  }
  return null;
}

function buildPrompt(
  group: OrderGroup,
  moduleNames: string[],
  currentTitle: string,
  quizTitle: string | undefined,
  digest: string,
  hasImage: boolean,
): string {
  const groupLabel = `${group.subject} · ${group.ageGroup} · ${group.year}-yil${group.section ? ` · ${group.section}` : ""}`;
  return `Sen Robbit Akademiyasi o'quv dasturi mutaxassisisan. Bitta darsning slaydlari berilgan — mavzu nomi va modulini aniqlashing kerak.

Kontekst:
- Bo'lim: ${groupLabel}
- Hozirgi (ishonchsiz bo'lishi mumkin) dars nomi: ${currentTitle}
${quizTitle && quizTitle !== currentTitle ? `- Quiz nomi: ${quizTitle}\n` : ""}${hasImage ? "- Birinchi slaydning RASMI ilova qilingan (odatda titul sahifa — mavzu shu yerda katta yozilgan bo'ladi)." : "- Rasm yo'q, faqat matnlar."}

Barcha slayd matnlari:
${digest || "(matn topilmadi)"}

MODULLAR (aynan shulardan birini tanla, boshqasini yozma):
${moduleNames.map((m) => `- ${m}`).join("\n")}
- boshqa (hech biriga mos kelmasa)

Vazifa — JSON qaytar:
- "mavzu": darsning TO'G'RI va TOZA nomi. O'zbek tilida (texnologik terminlar aslicha: Scratch, Figma, loop, sprite...). "N-dars", "Dars N" prefikslarini, qo'shtirnoqlarni QO'SHMA — faqat mavzuning o'zi, 3-80 belgi. Rasmda mavzu aniq ko'rinsa o'shani ol.
- "modul": yuqoridagi ro'yxatdan bittasi. Dars mazmunidagi texnologiyaga qarab tanla (masalan "Motion", "My blocks", "Costume" — Scratch; "Revolve", "Fillet", "Assembly" — Onshape; "MediaPlayer", "BluetoothClient" — App Inventor).
- "seq": slaydlarda modul ichidagi dars raqami ko'rinsa (masalan "7-dars") — o'sha; ko'rinmasa mazmunan taxminiy o'rin (kirish darslari kichik, loyiha/yakuniy darslar katta raqam).
- "manba": "rasm" (tituldan o'qildi) | "matn" (slayd matnlaridan) | "taxmin".
- "ishonch": 0-100 (titulda aniq yozilgan bo'lsa 90+, matndan mazmunan 60-85, taxmin <60).

Javob FAQAT bitta JSON obyekt: {"mavzu": "...", "modul": "...", "seq": 3, "manba": "rasm", "ishonch": 95}`;
}

// Claude Haiku — asosiy dvigatel (tez, arzon, vision bor)
async function askClaude(prompt: string, img: SlideImagePart | null): Promise<string> {
  if (!config.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY yo'q");
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const content: Anthropic.ContentBlockParam[] = [{ type: "text", text: prompt }];
  if (img) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.base64 },
    });
  }
  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [{ role: "user", content }],
  });
  return msg.content.map((c) => (c.type === "text" ? c.text : "")).join("");
}

// Gemini — zaxira (tekin reja; kvota daqiqa darajasida tiklanadi)
async function askGemini(prompt: string, img: SlideImagePart | null): Promise<string> {
  const parts: unknown[] = [{ text: prompt }];
  if (img) parts.push({ inline_data: { mime_type: img.mediaType, data: img.base64 } });
  return requestGeminiText(parts, { responseMimeType: "application/json", maxOutputTokens: 1000 });
}

function cleanTopic(raw: string): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/^\s*(\d+\s*[-–—.)]?\s*dars|dars\s*\d+)\s*[.:—-]?\s*/i, "")
    .replace(/^["'«"'`\s]+|["'»"'`\s.]+$/g, "")
    .trim()
    .slice(0, 200);
}

// Bitta darsni tahlil qiladi. Slaydlari bo'lmasa yoki AI ishlamasa —
// mavzu/modul null bilan qaytadi (chaqiruvchi eski qiymatlarni saqlaydi).
export async function analyzeLesson(
  quizId: string,
  group: OrderGroup,
  currentTitle: string,
  quizTitle?: string,
): Promise<LessonAnalysis> {
  const slides = await prisma.slide.findMany({
    where: { quizId },
    orderBy: { order: "asc" },
    select: { kind: true, data: true },
  });
  if (slides.length === 0) {
    return { mavzu: null, modul: null, seq: null, ishonch: 0, manba: "slayd-yoq", engine: null };
  }

  // Matn dayjesti: har slayddan, jami ~8000 belgigacha
  let digest = "";
  slides.forEach((s, i) => {
    if (digest.length > 8000) return;
    let data: Record<string, unknown>;
    try { data = JSON.parse(s.data) as Record<string, unknown>; } catch { return; }
    const texts = slideTexts(data);
    if (texts.length) digest += `Slayd ${i + 1} (${s.kind}): ${texts.join(" | ").slice(0, 400)}\n`;
  });

  const img = await firstImage(slides);
  const moduleNames = modulesFor(group).map((m) => m.name);
  const prompt = buildPrompt(group, moduleNames, currentTitle, quizTitle, digest, !!img);

  // Claude asosiy, Gemini zaxira; har biriga 2 urinish
  let text = "";
  let engine: LessonAnalysis["engine"] = null;
  let lastErr = "";
  for (const [name, ask] of [["claude", askClaude], ["gemini", askGemini]] as const) {
    for (let t = 0; t < 2 && !text; t++) {
      try {
        text = await ask(prompt, img);
        engine = name;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        await new Promise((r) => setTimeout(r, 4000 * (t + 1)));
      }
    }
    if (text) break;
  }
  if (!text) {
    return { mavzu: null, modul: null, seq: null, ishonch: 0, manba: `xato: ${lastErr.slice(0, 120)}`, engine: null };
  }

  const obj = firstJson(text);
  if (!obj) {
    return { mavzu: null, modul: null, seq: null, ishonch: 0, manba: "parse-xato", engine };
  }
  const mavzu = cleanTopic(String(obj.mavzu ?? ""));
  const seqNum = Number(obj.seq);
  return {
    mavzu: mavzu.length >= 3 ? mavzu : null,
    modul: typeof obj.modul === "string" && obj.modul.trim() ? obj.modul.trim().slice(0, 80) : null,
    seq: Number.isFinite(seqNum) && seqNum > 0 ? Math.round(seqNum) : null,
    ishonch: Math.max(0, Math.min(100, Number(obj.ishonch) || 0)),
    manba: typeof obj.manba === "string" ? obj.manba.slice(0, 40) : "?",
    engine,
  };
}
