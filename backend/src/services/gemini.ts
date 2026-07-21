import { config } from "../config.js";
import { OPTION_RULES, type GeneratedQuestion, type SlideImage } from "./claude.js";
import { shuffleAnswerOptions } from "./questionShuffle.js";

// Google Gemini orqali savol generatsiyasi — TEKIN reja (aistudio.google.com) bilan ishlaydi.
// claude.ts bilan bir xil natija shakli (GeneratedQuestion) qaytaradi, shuning uchun
// route'lar provayderni almashtirganda frontend hech narsani sezmaydi.
// REST orqali chaqiramiz (SDK'siz) — qo'shimcha dependency kerak emas.

// Google model nomlarini vaqti-vaqti bilan nafaqaga chiqaradi (2026-07: gemini-2.5-flash
// yangi foydalanuvchilarga yopildi). Bitta nomga qotib qolmaslik uchun kandidatlar
// ro'yxatidan birinchi ishlaganini tanlaymiz va xotirada eslab qolamiz — model eskirsa
// keyingi so'rov avtomatik yangisiga o'tadi, kod o'zgartirish shart emas.
const MODEL_CANDIDATES = [
  "gemini-3.5-flash", // 2026-07 holatida barqaror (GA), lekin tekin kvotasi juda kichik (~20/kun)
  "gemini-3-flash",
  "gemini-flash-latest", // Google'ning "eng so'nggi flash" taxallusi
  "gemini-flash-lite-latest", // lite — tekin kvotasi kengroq, vision ham bor (2026-07 sinovdan o'tgan)
  "gemini-2.5-flash", // eski loyihalar uchun hali ishlashi mumkin
];
let activeModel: string | null = null; // ishlagani shu yerda saqlanadi

// Xato "model mavjud emas" turidami? (boshqa xatolarda fallback qilmaymiz)
function isModelUnavailable(status: number, message: string): boolean {
  const m = message.toLowerCase();
  return (
    status === 404 ||
    m.includes("no longer available") ||
    m.includes("not found") ||
    m.includes("is not supported")
  );
}

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
${OPTION_RULES}

Natijani faqat JSON massiv sifatida qaytaring.`;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  error?: { message?: string; status?: string };
}

// Umumiy Gemini so'rovi: model-fallback bilan yuboradi, javob MATNINI qaytaradi.
// PDF savol generatsiyasi (pdf.ts) shu yadro orqali ishlaydi.
export async function requestGeminiText(parts: unknown[], generationConfig: Record<string, unknown>): Promise<string> {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY sozlanmagan");
  }
  const body = JSON.stringify({ contents: [{ parts }], generationConfig });

  // Ishlagan model ma'lum bo'lsa undan boshlaymiz, aks holda ro'yxatni ketma-ket sinaymiz
  const candidates = activeModel
    ? [activeModel, ...MODEL_CANDIDATES.filter((m) => m !== activeModel)]
    : MODEL_CANDIDATES;

  let res: Response | null = null;
  let data: GeminiResponse = {};
  for (const model of candidates) {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
    );
    data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (res.ok) {
      if (activeModel !== model) console.log(`[gemini] faol model: ${model}`);
      activeModel = model;
      break;
    }
    // Model eskirgan/topilmadi — keyingi kandidatga o'tamiz; boshqa xatolarda to'xtaymiz
    if (isModelUnavailable(res.status, data.error?.message ?? "")) {
      console.warn(`[gemini] model ishlamadi (${model}): ${data.error?.message ?? res.status}`);
      continue;
    }
    // 429 (kvota) — har modelning kvotasi ALOHIDA, shuning uchun keyingisini sinaymiz
    // (masalan gemini-3.5-flash kunlik 20 ta bilan tez tugaydi, flash-lite esa ishlayveradi).
    // activeModel'ni tozalaymiz — kvotasi tugagan modelga qaytib urilmaylik.
    if (res.status === 429) {
      console.warn(`[gemini] kvota tugadi (${model}) — keyingi model sinaladi`);
      if (activeModel === model) activeModel = null;
      continue;
    }
    break;
  }

  if (!res || !res.ok) {
    // Tekin kvota tugagan holatni foydalanuvchiga tushunarli qilib qaytaramiz
    if (res?.status === 429) {
      throw new Error("AI kunlik/daqiqalik limiti tugadi (Gemini tekin reja). Birozdan keyin qayta urinib ko'ring.");
    }
    throw new Error(data.error?.message || `Gemini xatosi (${res?.status ?? "ulanish"})`);
  }

  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

// Slayd titul sahifasi rasmidan DARS MAVZUSINI o'qiydi. Topa olmasa null.
export async function extractLessonTopicGemini(image: SlideImage): Promise<string | null> {
  const parts: unknown[] = [
    { inline_data: { mime_type: image.mediaType, data: image.base64 } },
    {
      text: `Bu — dars taqdimotining TITUL (birinchi) sahifasi. Undan DARS MAVZUSINI aniqla.

Qoidalar:
- Faqat mavzu matnining o'zini qaytar — izohsiz, qo'shtirnoqsiz.
- "N-dars", "Dars 5", sana, o'qituvchi ismi, "Robbit" kabi logo/brend yozuvlarini QO'SHMA.
- Mavzu bir necha qatorda bo'lsa bitta qatorga birlashtir.
- Til slaydda qanday bo'lsa shunday qoldir (odatda o'zbekcha).
- Agar sahifada aniq mavzu ko'rinmasa faqat NONE deb yoz.`,
    },
  ];
  const text = (await requestGeminiText(parts, { maxOutputTokens: 200 })).trim();
  if (!text || /^none$/i.test(text)) return null;
  // Bir qatorga keltirib, chetki qo'shtirnoq/nuqtalarni tozalaymiz
  const cleaned = text
    .replace(/\s+/g, " ")
    .replace(/^["'«"'`\s]+|["'»"'`\s.]+$/g, "")
    .trim()
    .slice(0, 200);
  return cleaned || null;
}

export async function generateQuestionsFromSlidesGemini(
  images: SlideImage[],
  texts: string[],
  existing: string[],
  count: number,
): Promise<GeneratedQuestion[]> {
  const parts: unknown[] = [
    ...images.map((img) => ({ inline_data: { mime_type: img.mediaType, data: img.base64 } })),
    { text: buildPrompt(texts, existing, count) },
  ];
  const text = await requestGeminiText(parts, {
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
    maxOutputTokens: 16000,
  });
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
  const cleaned = (parsed as GeneratedQuestion[])
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
  // To'g'ri javob doim A bo'lib qolmasligi uchun variantlar aralashtiriladi
  return shuffleAnswerOptions(cleaned);
}
