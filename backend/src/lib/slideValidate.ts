import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Slayd ma'lumotini qat'iy tekshirish (MCP uchun) ----
// Shakl `frontend/src/types.ts` SlideData bilan bir xil (kontrakt). Muharrir (REST) o'z
// tekshiruvini saqlaydi; bu yerda tashqi ilovadan (Claude) kelgan ma'lumot to'liq tekshiriladi:
// xato bo'lsa — tushunarli o'zbekcha xabar, hech narsa saqlanmaydi.

export const QTYPES = ["SINGLE", "MULTIPLE", "TRUE_FALSE", "DROPDOWN", "POLL", "OPEN", "FILL_BLANK", "MATCH", "REORDER"] as const;
export type QType = (typeof QTYPES)[number];
export const OPTION_TYPES: readonly QType[] = ["SINGLE", "MULTIPLE", "TRUE_FALSE", "DROPDOWN", "POLL"];

export const TYPE_LABELS: Record<QType, string> = {
  SINGLE: "Bir javobli test",
  MULTIPLE: "Bir nechta to'g'ri",
  TRUE_FALSE: "To'g'ri / Noto'g'ri",
  DROPDOWN: "Ochiluvchi (dropdown)",
  POLL: "So'rovnoma",
  OPEN: "Ochiq javob",
  FILL_BLANK: "Bo'sh joyni to'ldirish",
  MATCH: "Juftlash",
  REORDER: "Tartiblash",
};

export const LIMITS = {
  text: 1000, // savol matni / sarlavha
  body: 3000, // kontent slayd matni
  option: 300,
  notes: 2000,
  url: 1000,
  minOptions: 2,
  maxOptions: 8,
  maxAnswers: 20,
  maxBlanks: 10,
  maxBlankAnswers: 10,
  minPairs: 2,
  maxPairs: 10,
  minItems: 2,
  maxItems: 10,
  minTime: 5,
  maxTime: 300,
  maxPoints: 2000,
  maxSlidesPerQuiz: 300,
  maxSlidesPerCreate: 50,
};

const TF = ["To'g'ri", "Noto'g'ri"];
const BLANK_RE = /_{3,}/g;

/** HTML teglari va boshqaruv belgilarini olib tashlaydi (matn proyektor va telefonda chiqadi). */
export function cleanText(s: unknown, max: number): string {
  return String(s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

/** Rasm manzili: faqat bizning /uploads/... yoki https. */
export function checkImageUrl(u: unknown): string | null {
  const s = String(u ?? "").trim();
  if (!s) return null;
  if (/^\/uploads\/[A-Za-z0-9._-]+$/.test(s)) return s;
  try {
    const url = new URL(s);
    if (url.protocol === "https:" && s.length <= LIMITS.url) return url.href;
  } catch {
    /* pastda xato */
  }
  throw new SlideValidationError(["Rasm manzili faqat https://... yoki /uploads/... bo'lishi mumkin"]);
}

export class SlideValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors.join("; "));
  }
}

// ---------- MCP kirish shakli (Claude uchun sodda) ----------
const optionIn = z.object({
  text: z.string().max(LIMITS.option).describe("Variant matni"),
  correct: z.boolean().optional().describe("To'g'ri javobmi (POLL'da ishlatilmaydi)"),
  imageUrl: z.string().max(LIMITS.url).optional().describe("Variant rasmi: https://... (ixtiyoriy)"),
});

export const slideInputShape = {
  kind: z.enum(["QUESTION", "CONTENT"]).describe("QUESTION — savol, CONTENT — ma'lumot slaydi"),
  type: z.enum(QTYPES).optional().describe("Savol turi (faqat QUESTION uchun)"),
  text: z.string().max(LIMITS.text).optional().describe("Savol matni (QUESTION). FILL_BLANK'da bo'sh joylar ___ bilan belgilanadi"),
  title: z.string().max(LIMITS.text).optional().describe("Sarlavha (CONTENT)"),
  body: z.string().max(LIMITS.body).optional().describe("Asosiy matn (CONTENT)"),
  imageUrl: z.string().max(LIMITS.url).optional().describe("Rasm: https://... (ixtiyoriy)"),
  pageImageUrl: z
    .string()
    .max(LIMITS.url)
    .optional()
    .describe(
      "CONTENT: butun slaydni egallaydigan sahifa rasmi (16:9, masalan NotebookLM/PDF slaydi) — PDF import bilan bir xil format. " +
        "/uploads/... (create_image_upload) yoki https://... . Bunda title faqat ro'yxatdagi nom (ekranda ko'rinmaydi), body/imageUrl berilmaydi",
    ),
  options: z.array(optionIn).max(LIMITS.maxOptions).optional().describe("Variantlar: SINGLE/MULTIPLE/DROPDOWN/POLL"),
  statementIsTrue: z.boolean().optional().describe("TRUE_FALSE: savoldagi da'vo to'g'rimi"),
  answers: z.array(z.string().max(LIMITS.option)).max(LIMITS.maxAnswers).optional().describe("OPEN: qabul qilinadigan javoblar (bo'sh bo'lsa — ustoz o'zi baholaydigan yozma savol)"),
  blanks: z.array(z.array(z.string().max(LIMITS.option)).min(1).max(LIMITS.maxBlankAnswers)).max(LIMITS.maxBlanks).optional().describe("FILL_BLANK: har bir ___ uchun qabul qilinadigan javoblar, tartib bo'yicha"),
  pairs: z.array(z.object({ left: z.string().max(LIMITS.option), right: z.string().max(LIMITS.option) })).max(LIMITS.maxPairs).optional().describe("MATCH: juftliklar (chap → o'ng)"),
  items: z.array(z.string().max(LIMITS.option)).max(LIMITS.maxItems).optional().describe("REORDER: elementlar TO'G'RI tartibda"),
  timeLimit: z.number().int().min(LIMITS.minTime).max(LIMITS.maxTime).optional().describe("Vaqt, soniya (standart 20)"),
  points: z.number().int().min(0).max(LIMITS.maxPoints).optional().describe("Ball (standart 1000)"),
  notes: z.string().max(LIMITS.notes).optional().describe("Ustoz uchun izoh (o'quvchilarga ko'rinmaydi)"),
};
export const slideInputSchema = z.object(slideInputShape);
export type SlideInput = z.infer<typeof slideInputSchema>;

export interface BuiltSlide {
  kind: "QUESTION" | "CONTENT";
  type: QType | null;
  data: any;
  notes: string | null;
  timeLimit: number;
  points: number;
}

// Kontent slayd — muharrirning yangi (kanvas, 1280×720) formatida; SlideScene legacy
// koordinatalariga mos joylashuv.
function contentData(title: string, body: string, imageUrl: string | null): any {
  const els: any[] = [];
  const base = { rotation: 0, font: "Inter", align: "center", valign: "middle" };
  if (imageUrl) {
    els.push({ id: "mcp-img", type: "image", url: imageUrl, fit: "contain", x: 340, y: title || body ? 330 : 60, w: 600, h: title || body ? 360 : 600, rotation: 0, z: 0 });
  }
  if (title) {
    els.push({ ...base, id: "mcp-title", type: "text", text: title, size: 56, color: "#1d1c0f", bold: true, x: 120, y: imageUrl ? 40 : 200, w: 1040, h: 140, z: 1 });
  }
  if (body) {
    els.push({ ...base, id: "mcp-body", type: "text", text: body, size: 30, color: "#3c3633", x: 160, y: imageUrl ? 180 : 380, w: 960, h: imageUrl ? 140 : 220, z: 1 });
  }
  return { v: 2, background: { type: "color", value: "#ffffff" }, elements: els };
}

/** MCP kirishidan platforma slaydini quradi va to'liq tekshiradi. */
export function buildSlide(input: SlideInput): BuiltSlide {
  const errs: string[] = [];
  const notes = input.notes !== undefined ? cleanText(input.notes, LIMITS.notes) || null : null;
  if (input.kind === "CONTENT") {
    if (input.type) errs.push("CONTENT slaydda type bo'lmaydi");
    for (const f of ["text", "options", "statementIsTrue", "answers", "blanks", "pairs", "items"] as const) {
      if (input[f] !== undefined) errs.push(`CONTENT slaydda "${f}" maydoni bo'lmaydi (title, body, imageUrl ishlating)`);
    }
    const title = cleanText(input.title, LIMITS.text);
    if (input.pageImageUrl !== undefined) {
      // Sahifa slaydi (PDF import formati): rasm butun kanvasni egallaydi, title — faqat nom
      if (input.body !== undefined || input.imageUrl !== undefined) errs.push("pageImageUrl bilan body/imageUrl berilmaydi");
      const page = checkImageUrl(input.pageImageUrl);
      if (!page) errs.push("pageImageUrl bo'sh");
      if (errs.length) throw new SlideValidationError(errs);
      return { kind: "CONTENT", type: null, data: { title, body: "", imageUrl: page }, notes, timeLimit: input.timeLimit ?? 20, points: 0 };
    }
    const body = cleanText(input.body, LIMITS.body);
    const img = input.imageUrl ? checkImageUrl(input.imageUrl) : null;
    if (!title && !body && !img) errs.push("Kontent slaydda kamida sarlavha, matn yoki rasm bo'lishi kerak");
    if (errs.length) throw new SlideValidationError(errs);
    return { kind: "CONTENT", type: null, data: contentData(title, body, img), notes, timeLimit: input.timeLimit ?? 20, points: 0 };
  }

  const type = input.type;
  if (!type) throw new SlideValidationError(["Savol uchun type kerak: " + QTYPES.join(", ")]);
  if (input.title !== undefined || input.body !== undefined) errs.push("Savolda title/body bo'lmaydi — savol matni uchun text ishlating");
  if (input.pageImageUrl !== undefined) errs.push("pageImageUrl faqat CONTENT slayd uchun (savolda imageUrl ishlating)");
  const data: any = { text: cleanText(input.text, LIMITS.text) };
  if (input.imageUrl) data.imageUrl = checkImageUrl(input.imageUrl);

  const forbid = (fields: (keyof SlideInput)[]) => {
    for (const f of fields) if (input[f] !== undefined) errs.push(`${TYPE_LABELS[type]} (${type}) savolida "${String(f)}" maydoni bo'lmaydi`);
  };

  if (type === "TRUE_FALSE") {
    forbid(["options", "answers", "blanks", "pairs", "items"]);
    if (input.statementIsTrue === undefined) errs.push("TRUE_FALSE uchun statementIsTrue (true/false) kerak");
    data.options = [
      { text: TF[0], isCorrect: input.statementIsTrue === true },
      { text: TF[1], isCorrect: input.statementIsTrue === false },
    ];
  } else if (OPTION_TYPES.includes(type)) {
    forbid(["statementIsTrue", "answers", "blanks", "pairs", "items"]);
    data.options = (input.options ?? []).map((o) => {
      const opt: any = { text: cleanText(o.text, LIMITS.option), isCorrect: type === "POLL" ? false : o.correct === true };
      if (o.imageUrl) opt.imageUrl = checkImageUrl(o.imageUrl);
      return opt;
    });
  } else if (type === "OPEN") {
    forbid(["options", "statementIsTrue", "blanks", "pairs", "items"]);
    data.answers = (input.answers ?? []).map((a) => cleanText(a, LIMITS.option)).filter(Boolean);
  } else if (type === "FILL_BLANK") {
    forbid(["options", "statementIsTrue", "answers", "pairs", "items"]);
    data.blanks = (input.blanks ?? []).map((b) => b.map((a) => cleanText(a, LIMITS.option)).filter(Boolean));
  } else if (type === "MATCH") {
    forbid(["options", "statementIsTrue", "answers", "blanks", "items"]);
    data.pairs = (input.pairs ?? []).map((p) => ({ left: cleanText(p.left, LIMITS.option), right: cleanText(p.right, LIMITS.option) }));
  } else if (type === "REORDER") {
    forbid(["options", "statementIsTrue", "answers", "blanks", "pairs"]);
    data.items = (input.items ?? []).map((s) => cleanText(s, LIMITS.option));
  }
  if (errs.length) throw new SlideValidationError(errs);

  const built: BuiltSlide = {
    kind: "QUESTION",
    type,
    data,
    notes,
    timeLimit: input.timeLimit ?? 20,
    points: input.points ?? 1000,
  };
  validateSlide(built);
  return built;
}

/** Tayyor (platforma formatidagi) slaydni tekshiradi — qo'shishda ham, qisman tahrirdan keyin ham. */
export function validateSlide(s: BuiltSlide): void {
  const errs: string[] = [];
  if (!Number.isInteger(s.timeLimit) || s.timeLimit < LIMITS.minTime || s.timeLimit > LIMITS.maxTime) {
    errs.push(`Vaqt ${LIMITS.minTime}–${LIMITS.maxTime} soniya oralig'ida bo'lishi kerak`);
  }
  if (!Number.isInteger(s.points) || s.points < 0 || s.points > LIMITS.maxPoints) errs.push(`Ball 0–${LIMITS.maxPoints} oralig'ida bo'lishi kerak`);
  const d = s.data ?? {};

  if (s.kind === "CONTENT") {
    const els = Array.isArray(d.elements) ? d.elements : null;
    const hasLegacy = !!(d.title || d.body || d.imageUrl);
    if (!els && !hasLegacy) errs.push("Kontent slayd bo'sh");
    if (errs.length) throw new SlideValidationError(errs);
    return;
  }

  const type = s.type as QType;
  if (!QTYPES.includes(type)) throw new SlideValidationError([`Noma'lum savol turi: ${String(s.type)}`]);
  const text = String(d.text ?? "").trim();
  if (!text) errs.push("Savol matni (text) bo'sh bo'lmasligi kerak");

  if (OPTION_TYPES.includes(type)) {
    const opts: any[] = Array.isArray(d.options) ? d.options : [];
    const correct = opts.filter((o) => o.isCorrect).length;
    if (type === "TRUE_FALSE") {
      if (opts.length !== 2 || opts[0]?.text !== TF[0] || opts[1]?.text !== TF[1]) errs.push("TRUE_FALSE variantlari faqat \"To'g'ri\" va \"Noto'g'ri\"");
      if (correct !== 1) errs.push("TRUE_FALSE'da aynan bitta to'g'ri javob bo'lishi kerak");
    } else {
      if (opts.length < LIMITS.minOptions || opts.length > LIMITS.maxOptions) errs.push(`Variantlar soni ${LIMITS.minOptions}–${LIMITS.maxOptions} ta bo'lishi kerak (hozir ${opts.length})`);
      if (opts.some((o) => !String(o.text ?? "").trim() && !o.imageUrl)) errs.push("Bo'sh variant bo'lmasligi kerak");
      const texts = opts.map((o) => String(o.text ?? "").trim().toLowerCase()).filter(Boolean);
      if (new Set(texts).size !== texts.length) errs.push("Variantlar takrorlanmasligi kerak");
      if ((type === "SINGLE" || type === "DROPDOWN") && correct !== 1) errs.push(`${TYPE_LABELS[type]} savolida aynan bitta to'g'ri javob bo'lishi kerak (hozir ${correct})`);
      if (type === "MULTIPLE" && correct < 1) errs.push("Bir nechta to'g'ri javobli savolda kamida bitta to'g'ri javob bo'lishi kerak");
      if (type === "POLL" && correct > 0) errs.push("So'rovnomada to'g'ri javob bo'lmaydi");
    }
  } else if (type === "OPEN") {
    const ans: any[] = Array.isArray(d.answers) ? d.answers : [];
    if (ans.length > LIMITS.maxAnswers) errs.push(`Javoblar ko'pi bilan ${LIMITS.maxAnswers} ta`);
  } else if (type === "FILL_BLANK") {
    const blanks: any[] = Array.isArray(d.blanks) ? d.blanks : [];
    const marks = (text.match(BLANK_RE) ?? []).length;
    if (marks === 0) errs.push("Bo'sh joyni to'ldirish savolida matnda kamida bitta ___ bo'lishi kerak");
    if (marks !== blanks.length) errs.push(`Matndagi ___ soni (${marks}) va bo'sh joy javoblari soni (${blanks.length}) teng bo'lishi kerak`);
    if (blanks.length > LIMITS.maxBlanks) errs.push(`Bo'sh joylar ko'pi bilan ${LIMITS.maxBlanks} ta`);
    if (blanks.some((b) => !Array.isArray(b) || b.length === 0)) errs.push("Har bir bo'sh joy uchun kamida bitta javob bo'lishi kerak");
  } else if (type === "MATCH") {
    const pairs: any[] = Array.isArray(d.pairs) ? d.pairs : [];
    if (pairs.length < LIMITS.minPairs || pairs.length > LIMITS.maxPairs) errs.push(`Juftliklar soni ${LIMITS.minPairs}–${LIMITS.maxPairs} ta bo'lishi kerak`);
    if (pairs.some((p) => !String(p.left ?? "").trim() || !String(p.right ?? "").trim())) errs.push("Juftlikning ikkala tomoni ham to'ldirilishi kerak");
  } else if (type === "REORDER") {
    const items: any[] = Array.isArray(d.items) ? d.items : [];
    if (items.length < LIMITS.minItems || items.length > LIMITS.maxItems) errs.push(`Elementlar soni ${LIMITS.minItems}–${LIMITS.maxItems} ta bo'lishi kerak`);
    if (items.some((x) => !String(x ?? "").trim())) errs.push("Bo'sh element bo'lmasligi kerak");
  }
  if (errs.length) throw new SlideValidationError(errs);
}

// ---------- Qisman tahrir (update_slide) ----------
export const slideChangesShape = {
  text: z.string().max(LIMITS.text).optional().describe("Savol matni (QUESTION)"),
  title: z.string().max(LIMITS.text).optional().describe("Sarlavha (MCP yaratgan yoki eski formatdagi CONTENT)"),
  body: z.string().max(LIMITS.body).nullable().optional().describe("Matn (CONTENT). null — olib tashlash"),
  imageUrl: z.string().max(LIMITS.url).nullable().optional().describe("Rasm: https://... ; null — olib tashlash"),
  timeLimit: z.number().int().min(LIMITS.minTime).max(LIMITS.maxTime).optional().describe("Vaqt, soniya"),
  points: z.number().int().min(0).max(LIMITS.maxPoints).optional(),
  notes: z.string().max(LIMITS.notes).nullable().optional().describe("Ustoz izohi; null — tozalash"),
  options: z.array(optionIn).max(LIMITS.maxOptions).optional().describe("Variantlar ro'yxatini TO'LIQ almashtirish (SINGLE/MULTIPLE/DROPDOWN/POLL)"),
  correct: z.array(z.number().int().min(0).max(LIMITS.maxOptions - 1)).max(LIMITS.maxOptions).optional().describe("To'g'ri variant(lar) tartib raqamlari, 0 dan (get_slide'dagi options tartibi bo'yicha)"),
  statementIsTrue: z.boolean().optional().describe("TRUE_FALSE: da'vo to'g'rimi"),
  answers: z.array(z.string().max(LIMITS.option)).max(LIMITS.maxAnswers).optional().describe("OPEN: javoblarni to'liq almashtirish"),
  blanks: z.array(z.array(z.string().max(LIMITS.option)).min(1).max(LIMITS.maxBlankAnswers)).max(LIMITS.maxBlanks).optional().describe("FILL_BLANK: bo'sh joy javoblarini to'liq almashtirish"),
  pairs: z.array(z.object({ left: z.string().max(LIMITS.option), right: z.string().max(LIMITS.option) })).max(LIMITS.maxPairs).optional().describe("MATCH: juftliklarni to'liq almashtirish"),
  items: z.array(z.string().max(LIMITS.option)).max(LIMITS.maxItems).optional().describe("REORDER: to'g'ri tartibni to'liq almashtirish"),
  elements: z
    .array(
      z.object({
        id: z.string().max(100),
        text: z.string().max(LIMITS.body).optional(),
        x: z.number().min(-1280).max(2560).optional(),
        y: z.number().min(-720).max(1440).optional(),
        w: z.number().min(1).max(2560).optional(),
        h: z.number().min(1).max(1440).optional(),
      }),
    )
    .max(50)
    .optional()
    .describe("Kanvas CONTENT slayd: id bo'yicha bitta yoki bir nechta elementning matni/joylashuvi (get_slide'dagi data.elements)"),
};
export const slideChangesSchema = z.object(slideChangesShape);
export type SlideChanges = z.infer<typeof slideChangesSchema>;

export interface FieldDiff {
  field: string;
  label: string;
  before: string;
  after: string;
}

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "(yo'q)";
  return typeof v === "string" ? v : JSON.stringify(v);
};
const optsText = (opts: any[] | undefined, poll = false) =>
  (opts ?? []).map((o, i) => `${String.fromCharCode(65 + i)}) ${o.text}${!poll && o.isCorrect ? " ✓" : ""}`).join(" | ");

/**
 * Qisman tahrirni qo'llaydi: faqat yuborilgan maydonlar o'zgaradi. Natija to'liq tekshiriladi.
 * Qaytaradi: yangi slayd va "eski → yangi" farqlar ro'yxati.
 */
export function applyChanges(current: BuiltSlide, changes: SlideChanges): { slide: BuiltSlide; diff: FieldDiff[] } {
  const errs: string[] = [];
  const keys = Object.keys(changes).filter((k) => (changes as any)[k] !== undefined);
  if (keys.length === 0) throw new SlideValidationError(["O'zgartiriladigan maydon yuborilmadi"]);
  const next: BuiltSlide = { ...current, data: JSON.parse(JSON.stringify(current.data ?? {})) };
  const d = next.data;
  const diff: FieldDiff[] = [];
  const push = (field: string, label: string, before: unknown, after: unknown) => {
    if (show(before) !== show(after)) diff.push({ field, label, before: show(before), after: show(after) });
  };
  const type = current.type as QType | null;
  const isQ = current.kind === "QUESTION";
  const isCanvas = !isQ && Array.isArray(d.elements);
  const allowed = new Set<string>(["timeLimit", "points", "notes"]);
  if (isQ) {
    allowed.add("text").add("imageUrl");
    if (type === "TRUE_FALSE") allowed.add("statementIsTrue");
    else if (type && OPTION_TYPES.includes(type)) {
      allowed.add("options");
      if (type !== "POLL") allowed.add("correct");
    } else if (type === "OPEN") allowed.add("answers");
    else if (type === "FILL_BLANK") allowed.add("blanks");
    else if (type === "MATCH") allowed.add("pairs");
    else if (type === "REORDER") allowed.add("items");
  } else if (isCanvas) {
    allowed.add("elements");
    // MCP yaratgan kanvas slaydda sarlavha/matn/rasm elementlari ma'lum id'li
    for (const f of ["title", "body", "imageUrl"]) allowed.add(f);
  } else {
    for (const f of ["title", "body", "imageUrl"]) allowed.add(f);
  }
  const what = isQ ? `${TYPE_LABELS[type as QType]} (${type}) savolida` : "Kontent slaydda";
  for (const k of keys) if (!allowed.has(k)) errs.push(`${what} "${k}" maydonini o'zgartirib bo'lmaydi`);
  if (errs.length) throw new SlideValidationError(errs);

  if (changes.timeLimit !== undefined) { push("timeLimit", "Vaqt (soniya)", current.timeLimit, changes.timeLimit); next.timeLimit = changes.timeLimit; }
  if (changes.points !== undefined) { push("points", "Ball", current.points, changes.points); next.points = changes.points; }
  if (changes.notes !== undefined) {
    const v = changes.notes === null ? null : cleanText(changes.notes, LIMITS.notes) || null;
    push("notes", "Ustoz izohi", current.notes, v);
    next.notes = v;
  }

  if (isQ) {
    if (changes.text !== undefined) { const v = cleanText(changes.text, LIMITS.text); push("text", "Savol matni", d.text, v); d.text = v; }
    if (changes.imageUrl !== undefined) {
      const v = changes.imageUrl === null ? null : checkImageUrl(changes.imageUrl);
      push("imageUrl", "Rasm", d.imageUrl, v);
      if (v) d.imageUrl = v; else delete d.imageUrl;
    }
    if (changes.statementIsTrue !== undefined) {
      const before = d.options?.[0]?.isCorrect === true;
      d.options = [{ text: TF[0], isCorrect: changes.statementIsTrue }, { text: TF[1], isCorrect: !changes.statementIsTrue }];
      push("statementIsTrue", "To'g'ri javob", before ? TF[0] : TF[1], changes.statementIsTrue ? TF[0] : TF[1]);
    }
    if (changes.options !== undefined) {
      const before = optsText(d.options, type === "POLL");
      d.options = changes.options.map((o) => {
        const opt: any = { text: cleanText(o.text, LIMITS.option), isCorrect: type === "POLL" ? false : o.correct === true };
        if (o.imageUrl) opt.imageUrl = checkImageUrl(o.imageUrl);
        return opt;
      });
      if (changes.correct === undefined) push("options", "Variantlar", before, optsText(d.options, type === "POLL"));
      else diff.push({ field: "options", label: "Variantlar", before, after: "" }); // after pastda
    }
    if (changes.correct !== undefined) {
      const opts: any[] = d.options ?? [];
      const bad = changes.correct.filter((i) => i >= opts.length);
      if (bad.length) throw new SlideValidationError([`correct: ${bad.join(", ")} raqamli variant yo'q (variantlar 0–${opts.length - 1})`]);
      const before = optsText(current.data?.options);
      d.options = opts.map((o, i) => ({ ...o, isCorrect: changes.correct!.includes(i) }));
      const after = optsText(d.options);
      const idx = diff.findIndex((x) => x.field === "options");
      if (idx >= 0) diff[idx] = { ...diff[idx], after };
      else push("correct", "To'g'ri javob(lar)", before, after);
    }
    if (changes.answers !== undefined) {
      const v = changes.answers.map((a) => cleanText(a, LIMITS.option)).filter(Boolean);
      push("answers", "Qabul qilinadigan javoblar", (d.answers ?? []).join(", "), v.join(", "));
      d.answers = v;
    }
    if (changes.blanks !== undefined) {
      const v = changes.blanks.map((b) => b.map((a) => cleanText(a, LIMITS.option)).filter(Boolean));
      push("blanks", "Bo'sh joy javoblari", (d.blanks ?? []).map((b: string[]) => b.join("/")).join(" | "), v.map((b) => b.join("/")).join(" | "));
      d.blanks = v;
    }
    if (changes.pairs !== undefined) {
      const v = changes.pairs.map((p) => ({ left: cleanText(p.left, LIMITS.option), right: cleanText(p.right, LIMITS.option) }));
      const fmt = (ps: any[]) => (ps ?? []).map((p) => `${p.left} → ${p.right}`).join(", ");
      push("pairs", "Juftliklar", fmt(d.pairs), fmt(v));
      d.pairs = v;
    }
    if (changes.items !== undefined) {
      const v = changes.items.map((s) => cleanText(s, LIMITS.option));
      push("items", "To'g'ri tartib", (d.items ?? []).join(" → "), v.join(" → "));
      d.items = v;
    }
  } else if (isCanvas) {
    const els: any[] = d.elements;
    const byId = (id: string) => els.find((e) => e?.id === id);
    const setText = (id: string, label: string, v: string | null, make: () => any) => {
      const el = byId(id);
      if (v === null || v === "") {
        if (el) { push(id, label, el.text ?? el.url, null); els.splice(els.indexOf(el), 1); }
        return;
      }
      if (el) { push(id, label, el.type === "image" ? el.url : el.text, v); if (el.type === "image") el.url = v; else el.text = v; }
      else { push(id, label, null, v); els.push(make()); }
    };
    if (changes.title !== undefined) {
      const v = cleanText(changes.title, LIMITS.text);
      setText("mcp-title", "Sarlavha", v, () => contentData(v, "", null).elements[0]);
    }
    if (changes.body !== undefined) {
      const v = changes.body === null ? null : cleanText(changes.body, LIMITS.body);
      setText("mcp-body", "Matn", v, () => contentData("", v ?? "", null).elements[0]);
    }
    if (changes.imageUrl !== undefined) {
      const v = changes.imageUrl === null ? null : checkImageUrl(changes.imageUrl);
      setText("mcp-img", "Rasm", v, () => contentData("", "", v).elements[0]);
    }
    for (const p of changes.elements ?? []) {
      const el = byId(p.id);
      if (!el) { errs.push(`"${p.id}" id'li element topilmadi (get_slide'dagi data.elements'ni qarang)`); continue; }
      if (p.text !== undefined) {
        if (el.type !== "text") { errs.push(`"${p.id}" matn elementi emas`); continue; }
        const v = cleanText(p.text, LIMITS.body);
        push(`element:${p.id}`, `Element ${p.id} matni`, el.text, v);
        el.text = v;
      }
      for (const g of ["x", "y", "w", "h"] as const) {
        if (p[g] !== undefined) { push(`element:${p.id}.${g}`, `Element ${p.id} ${g}`, el[g], p[g]); el[g] = p[g]; }
      }
    }
    if (errs.length) throw new SlideValidationError(errs);
  } else {
    // Eski (legacy) formatdagi kontent slayd
    if (changes.title !== undefined) { const v = cleanText(changes.title, LIMITS.text); push("title", "Sarlavha", d.title, v); d.title = v; }
    if (changes.body !== undefined) { const v = changes.body === null ? "" : cleanText(changes.body, LIMITS.body); push("body", "Matn", d.body, v); d.body = v; }
    if (changes.imageUrl !== undefined) {
      const v = changes.imageUrl === null ? null : checkImageUrl(changes.imageUrl);
      push("imageUrl", "Rasm", d.imageUrl, v);
      if (v) d.imageUrl = v; else delete d.imageUrl;
    }
  }

  if (diff.length === 0) throw new SlideValidationError(["Yuborilgan qiymatlar hozirgisi bilan bir xil — o'zgarish yo'q"]);
  validateSlide(next);
  return { slide: next, diff };
}

/** Slaydning o'qiladigan to'liq tavsifi (oldindan ko'rinish uchun). */
export function describeSlide(s: BuiltSlide): string {
  const d = s.data ?? {};
  if (s.kind === "CONTENT") {
    if (!Array.isArray(d.elements) && d.imageUrl && !d.body) return `Sahifa slaydi (to'liq ekran rasm)${d.title ? `: ${d.title}` : ""}`;
    const texts = Array.isArray(d.elements)
      ? d.elements.filter((e: any) => e?.type === "text").map((e: any) => e.text)
      : [d.title, d.body].filter(Boolean);
    const img = Array.isArray(d.elements) ? d.elements.some((e: any) => e?.type === "image") : !!d.imageUrl;
    return `Kontent slayd: ${texts.join(" / ") || "(matnsiz)"}${img ? " [rasm bilan]" : ""}`;
  }
  const t = s.type as QType;
  const lines = [`${TYPE_LABELS[t]}: ${d.text}`];
  if (OPTION_TYPES.includes(t)) lines.push(`Variantlar: ${optsText(d.options, t === "POLL")}`);
  if (t === "OPEN") lines.push(d.answers?.length ? `Javoblar: ${d.answers.join(", ")}` : "Yozma savol (ustoz baholaydi)");
  if (t === "FILL_BLANK") lines.push(`Bo'sh joylar: ${(d.blanks ?? []).map((b: string[]) => b.join("/")).join(" | ")}`);
  if (t === "MATCH") lines.push(`Juftliklar: ${(d.pairs ?? []).map((p: any) => `${p.left} → ${p.right}`).join(", ")}`);
  if (t === "REORDER") lines.push(`To'g'ri tartib: ${(d.items ?? []).join(" → ")}`);
  if (d.imageUrl) lines.push("Rasm bilan");
  lines.push(`Vaqt: ${s.timeLimit} s · Ball: ${s.points}`);
  return lines.join("\n");
}
