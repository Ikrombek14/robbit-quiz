import { config } from "../config.js";
import type { GeneratedQuestion, SlideImage } from "./claude.js";

// Google Gemini orqali savol generatsiyasi — TEKIN reja (aistudio.google.com) bilan ishlaydi.
// claude.ts bilan bir xil natija shakli (GeneratedQuestion) qaytaradi, shuning uchun
// route'lar provayderni almashtirganda frontend hech narsani sezmaydi.
// REST orqali chaqiramiz (SDK'siz) — qo'shimcha dependency kerak emas.

const MODEL = "gemini-2.5-flash"; // tekin kvotada mavjud, rasm tahlili kuchli

// Gemini structured output sxemasi (OpenAPI subset) — savollar massivi
const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      type: { type: "STRING", enum: ["SINGLE", "MULTIPLE", "TRUE_FALSE", "OPEN"] },
      text: { type: "STRING" },
      options: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            text: { type: "STRING" },
            isCorrect: { type: "BOOLEAN" },
          },
          required: ["text", "isCorrect"],
        },
      },
      openAnswers: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["type", "text"],
  },
};

function buildPrompt(texts: string[], existing: string[], count: number): string {
  return `Yuqorida dars taqdimoti slaydlari berilgan (rasmlar${texts.length ? " va matnlar" : ""}). Ularni diqqat bilan o'rganing va DARS MAZMUNI asosida ${count} ta sifatli test savoli tuzing — dars oxirida o'quvchilar bilimini tekshirish uchun.

${texts.length ? `Slaydlardagi matnlar:\n${texts.map((t) => `- ${t}`).join("\n")}\n` : ""}${
    existing.length
      ? `\nBu savollar quizda ALLAQACHON BOR — ularni va ularga o'xshashlarini TAKRORLAMANG:\n${existing.map((t) => `- ${t}`).join("\n")}\n`
      : ""
  }
Talablar:
- Barcha savollar va javoblar O'ZBEK TILIDA bo'lsin.
- Savollar faqat slaydlardagi haqiqiy mazmunga asoslansin (umumiy bilim emas).
- Turlarni aralashtiring: ko'pi SINGLE (4 ta variant, bittasi to'g'ri), ba'zilari TRUE_FALSE va MULTIPLE, kerak bo'lsa OPEN.
- SINGLE va MULTIPLE uchun 4 ta variant bering; aniq belgilang qaysi(lar) to'g'ri (isCorrect=true).
- TRUE_FALSE uchun aniq 2 ta variant: "To'g'ri" va "Noto'g'ri".
- OPEN savollar uchun openAnswers'da qabul qilinadigan qisqa javoblarni bering.
- Oson savollardan qiyinlariga qarab tartiblang.

Natijani faqat JSON massiv sifatida qaytaring.`;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  error?: { message?: string; status?: string };
}

export async function generateQuestionsFromSlidesGemini(
  images: SlideImage[],
  texts: string[],
  existing: string[],
  count: number,
): Promise<GeneratedQuestion[]> {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY sozlanmagan");
  }

  const parts: unknown[] = [
    ...images.map((img) => ({ inline_data: { mime_type: img.mediaType, data: img.base64 } })),
    { text: buildPrompt(texts, existing, count) },
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${config.geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          maxOutputTokens: 16000,
        },
      }),
    },
  );

  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    // Tekin kvota tugagan holatni foydalanuvchiga tushunarli qilib qaytaramiz
    if (res.status === 429) {
      throw new Error("AI kunlik/daqiqalik limiti tugadi (Gemini tekin reja). Birozdan keyin qayta urinib ko'ring.");
    }
    throw new Error(data.error?.message || `Gemini xatosi (${res.status})`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new Error("AI savollarni qaytarmadi. Qayta urinib ko'ring.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("AI javobini o'qib bo'lmadi. Qayta urinib ko'ring.");
  }
  if (!Array.isArray(parsed)) return [];
  // Shaklni tozalab qaytaramiz (Gemini ba'zan ortiqcha maydon qo'shishi mumkin)
  return (parsed as GeneratedQuestion[])
    .filter((q) => q && typeof q.text === "string" && q.text.trim())
    .map((q) => ({
      type: ["SINGLE", "MULTIPLE", "TRUE_FALSE", "OPEN"].includes(q.type) ? q.type : "SINGLE",
      text: q.text.trim(),
      options: Array.isArray(q.options)
        ? q.options
            .filter((o) => o && typeof o.text === "string")
            .map((o) => ({ text: o.text, isCorrect: !!o.isCorrect }))
        : undefined,
      openAnswers: Array.isArray(q.openAnswers) ? q.openAnswers.map(String) : undefined,
    }));
}
