import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

export interface GeneratedQuestion {
  type: "SINGLE" | "MULTIPLE" | "TRUE_FALSE" | "OPEN";
  text: string;
  options?: { text: string; isCorrect: boolean }[];
  openAnswers?: string[];
}

// Claude'dan tuzilgan (structured) javob olish uchun "tool" sxemasi.
// Bu usul model'ni aniq JSON formatda javob berishga majbur qiladi.
const QUESTION_TOOL = {
  name: "save_questions",
  description: "PDF asosida yaratilgan test savollarini saqlash",
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: "Test savollari ro'yxati",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["SINGLE", "MULTIPLE", "TRUE_FALSE", "OPEN"],
              description:
                "SINGLE=bitta to'g'ri javobli test, MULTIPLE=bir nechta to'g'ri, TRUE_FALSE=to'g'ri/noto'g'ri, OPEN=ochiq javob",
            },
            text: { type: "string", description: "Savol matni" },
            options: {
              type: "array",
              description:
                "Javob variantlari (SINGLE/MULTIPLE/TRUE_FALSE uchun). TRUE_FALSE uchun aniq 2 ta: 'To'g'ri' va 'Noto'g'ri'.",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  isCorrect: { type: "boolean" },
                },
                required: ["text", "isCorrect"],
              },
            },
            openAnswers: {
              type: "array",
              description: "OPEN savollar uchun qabul qilinadigan to'g'ri javoblar",
              items: { type: "string" },
            },
          },
          required: ["type", "text"],
        },
      },
    },
    required: ["questions"],
  },
};

export async function generateQuestionsFromPdf(
  pdfBase64: string,
  count: number,
): Promise<GeneratedQuestion[]> {
  if (!config.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY sozlanmagan. backend/.env faylida kalitni kiriting.",
    );
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const prompt = `Quyidagi PDF hujjat matnini diqqat bilan o'qing va uning mazmuni asosida ${count} ta sifatli test savoli tuzing.

Talablar:
- Barcha savollar va javoblar O'ZBEK TILIDA bo'lsin.
- Savollar hujjatdagi haqiqiy mazmunga asoslansin (umumiy bilim emas).
- Turlarni aralashtiring: ko'pi SINGLE (4 ta variant, bittasi to'g'ri), ba'zilari TRUE_FALSE va MULTIPLE, kerak bo'lsa OPEN.
- SINGLE va MULTIPLE uchun 4 ta variant bering; aniq belgilang qaysi(lar) to'g'ri (isCorrect=true).
- TRUE_FALSE uchun aniq 2 ta variant: "To'g'ri" va "Noto'g'ri".
- Savollar aniq, tushunarli va xatosiz bo'lsin.

Natijani 'save_questions' tool orqali qaytaring.`;

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    tools: [QUESTION_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: "save_questions" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("AI savollarni qaytarmadi. Qayta urinib ko'ring.");
  }

  const input = toolUse.input as { questions?: GeneratedQuestion[] };
  return input.questions ?? [];
}
