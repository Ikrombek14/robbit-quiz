// Quizning BIRINCHI slaydidan dars mavzusini ajratish.
//
// Ikki bosqich:
//   1) TEKIN: slayd data'sidagi matn elementlari — eng katta shriftlisi mavzu
//      deb olinadi (kam uchraydi: importlarda titul sahifa odatda rasm).
//   2) AI: birinchi slayddagi to'liq sahifa rasmini Gemini vision o'qiydi
//      (rasm serverning o'zida, uploads/ da — tashqi so'rov faqat Gemini'ga).
//
// Topa olmasa null qaytadi — chaqiruvchi eski nomni saqlab qoladi.

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../prisma.js";
import { UPLOADS_DIR } from "../routes/upload.js";
import { extractLessonTopicGemini } from "./gemini.js";
import type { SlideImage } from "./claude.js";

interface SlideElement {
  type?: string;
  text?: string;
  size?: number;
  url?: string;
}

// "1-dars:", "Dars 5.", chetki qo'shtirnoqlar kabi keraksiz qismlarni tozalaydi
function cleanTopic(raw: string): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/^\s*(\d+\s*[-–—.)]?\s*dars|dars\s*\d+)\s*[.:—-]?\s*/i, "")
    .replace(/^["'«"'`\s]+|["'»"'`\s.]+$/g, "")
    .trim()
    .slice(0, 200);
}

// MIME turini fayl kengaytmasidan aniqlaymiz
function mimeFor(file: string): SlideImage["mediaType"] {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  return "image/webp";
}

// 1-bosqich: matn elementlaridan mavzu (eng katta shrift, mazmunli uzunlik)
function topicFromTextElements(elements: SlideElement[]): string | null {
  const texts = elements
    .filter((e) => e.type === "text" && typeof e.text === "string")
    .map((e) => ({ text: e.text!.replace(/\s+/g, " ").trim(), size: Number(e.size) || 0 }))
    .filter((t) => t.text.length >= 3 && t.text.length <= 160)
    // faqat raqam/sana bo'lgan matnlar mavzu emas
    .filter((t) => !/^[\d\s.:\-–—)]+$/.test(t.text))
    .sort((a, b) => b.size - a.size);
  if (texts.length === 0) return null;
  const cleaned = cleanTopic(texts[0].text);
  return cleaned.length >= 3 ? cleaned : null;
}

// 2-bosqich uchun rasm: birinchi slayddagi eng katta rasm elementi (lokal uploads)
async function slideImage(elements: SlideElement[]): Promise<SlideImage | null> {
  const img = elements.find((e) => e.type === "image" && typeof e.url === "string" && e.url.startsWith("/uploads/"));
  if (!img?.url) return null;
  const base = path.basename(img.url); // path traversal himoyasi
  try {
    const buf = await fs.readFile(path.join(UPLOADS_DIR, base));
    return { base64: buf.toString("base64"), mediaType: mimeFor(base) };
  } catch {
    return null; // fayl topilmadi — AI bosqichiga o'tolmaymiz
  }
}

// Asosiy: quizning birinchi slaydidan mavzu. Topilmasa null.
export async function extractTopicForQuiz(quizId: string): Promise<string | null> {
  const slide = await prisma.slide.findFirst({
    where: { quizId },
    orderBy: { order: "asc" },
    select: { data: true },
  });
  if (!slide) return null;

  let elements: SlideElement[] = [];
  try {
    const data = JSON.parse(slide.data) as { elements?: SlideElement[] };
    elements = Array.isArray(data.elements) ? data.elements : [];
  } catch {
    return null;
  }

  // 1) Matn elementlari — tekin va bir zumda
  const fromText = topicFromTextElements(elements);
  if (fromText) return fromText;

  // 2) Rasmni Gemini o'qiydi
  const image = await slideImage(elements);
  if (!image) return null;
  const topic = await extractLessonTopicGemini(image);
  return topic ? cleanTopic(topic) || null : null;
}
