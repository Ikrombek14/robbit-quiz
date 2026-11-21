import { z } from "zod";
import {
  OPTION_TYPES,
  TYPE_LABELS,
  LIMITS,
  QTYPES,
  buildSlide,
  cleanText,
  checkImageUrl,
  validateSlide,
  SlideValidationError,
  type BuiltSlide,
  type QType,
  type SlideInput,
} from "./slideValidate.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Slayd elementlari (variant / juftlik / tartib elementi / bo'sh joy) ustida nuqtaviy amallar ----
// itemId — elementning SHU quiz versiyasidagi o'rniga bog'langan belgi ("opt-2", "pair-0", ...).
// Har bir yozuvchi amal quizVersion talab qiladi: versiya o'zgarsa (muharrir, boshqa tahrir) amal
// rad etiladi — shuning uchun eski itemId bilan noto'g'ri elementga yozib bo'lmaydi.
// Bitta chaqiruv ichidagi barcha amallar ASL ro'yxatdagi itemId'larga ishora qiladi.

type ItemKind = "opt" | "pair" | "item" | "blank";

function itemKindOf(type: QType | null): ItemKind | null {
  if (!type) return null;
  if (type === "TRUE_FALSE") return null; // ikki qat'iy variant — update_slide (statementIsTrue)
  if (OPTION_TYPES.includes(type)) return "opt";
  if (type === "MATCH") return "pair";
  if (type === "REORDER") return "item";
  if (type === "FILL_BLANK") return "blank";
  return null;
}

const KIND_LABEL: Record<ItemKind, string> = { opt: "variant", pair: "juftlik", item: "element", blank: "bo'sh joy" };

/** get_slide uchun: elementlar itemId bilan (faqat shu quizVersion uchun amal qiladi). */
export function listItems(s: BuiltSlide): any[] | undefined {
  const k = s.kind === "QUESTION" ? itemKindOf(s.type) : null;
  const d = s.data ?? {};
  if (k === "opt") return (d.options ?? []).map((o: any, i: number) => ({ itemId: `opt-${i}`, text: o.text, correct: s.type === "POLL" ? undefined : !!o.isCorrect, ...(o.imageUrl ? { imageUrl: o.imageUrl } : {}) }));
  if (k === "pair") return (d.pairs ?? []).map((p: any, i: number) => ({ itemId: `pair-${i}`, left: p.left, right: p.right }));
  if (k === "item") return (d.items ?? []).map((t: string, i: number) => ({ itemId: `item-${i}`, text: t, correctPosition: i + 1 }));
  if (k === "blank") return (d.blanks ?? []).map((b: string[], i: number) => ({ itemId: `blank-${i}`, answers: b }));
  return undefined;
}

export const itemOpSchema = z.object({
  op: z.enum(["add", "update", "remove", "move"]).describe("add — qo'shish, update — o'zgartirish, remove — olib tashlash, move — o'rnini o'zgartirish"),
  itemId: z.string().max(40).optional().describe("update/remove/move uchun: get_slide'dagi items[].itemId"),
  position: z.number().int().min(1).max(50).optional().describe("add/move: 1 dan boshlab yangi o'rin (add'da berilmasa — oxiriga)"),
  text: z.string().max(LIMITS.option).optional().describe("Variant yoki tartib elementi matni"),
  correct: z.boolean().optional().describe("Variant to'g'rimi (SINGLE/DROPDOWN'da true bersangiz, qolganlari avtomatik noto'g'ri bo'ladi)"),
  imageUrl: z.string().max(LIMITS.url).nullable().optional().describe("Variant rasmi https://... ; null — olib tashlash"),
  left: z.string().max(LIMITS.option).optional().describe("MATCH: chap tomon"),
  right: z.string().max(LIMITS.option).optional().describe("MATCH: o'ng tomon"),
  answers: z.array(z.string().max(LIMITS.option)).min(1).max(LIMITS.maxBlankAnswers).optional().describe("FILL_BLANK: shu bo'sh joy uchun qabul qilinadigan javoblar"),
});
export type ItemOp = z.infer<typeof itemOpSchema>;
export const MAX_ITEM_OPS = 20;

const fmtOpt = (o: any, poll: boolean) => `${o.text}${!poll && o.isCorrect ? " ✓" : ""}${o.imageUrl ? " [rasm]" : ""}`;

function formatList(type: QType, d: any): string[] {
  const poll = type === "POLL";
  if (OPTION_TYPES.includes(type)) return (d.options ?? []).map((o: any, i: number) => `${String.fromCharCode(65 + i)}) ${fmtOpt(o, poll)}`);
  if (type === "MATCH") return (d.pairs ?? []).map((p: any, i: number) => `${i + 1}) ${p.left} → ${p.right}`);
  if (type === "REORDER") return (d.items ?? []).map((t: string, i: number) => `${i + 1}) ${t}`);
  if (type === "FILL_BLANK") return (d.blanks ?? []).map((b: string[], i: number) => `${i + 1}-bo'sh joy: ${b.join(" / ")}`);
  return [];
}

/**
 * Amallarni ketma-ket qo'llaydi (ATOMAR: bittasi xato bo'lsa — butun chaqiruv xato, hech narsa
 * qaytmaydi). `text` berilsa — savol matni ham shu amal bilan o'zgaradi (FILL_BLANK'da ___ qo'shish uchun).
 */
export function applyItemOps(current: BuiltSlide, ops: ItemOp[], newText?: string): { slide: BuiltSlide; lines: string[]; before: string[]; after: string[] } {
  if (current.kind !== "QUESTION") throw new SlideValidationError(["Kontent slaydda variantlar yo'q — matn uchun update_slide (elements) ishlating"]);
  const type = current.type as QType;
  const k = itemKindOf(type);
  if (!k) {
    throw new SlideValidationError([
      type === "TRUE_FALSE"
        ? "To'g'ri/Noto'g'ri savolida variantlar qat'iy — to'g'ri javobni update_slide (statementIsTrue) bilan o'zgartiring"
        : `${TYPE_LABELS[type]} savolida alohida elementlar yo'q — update_slide ishlating`,
    ]);
  }
  if (ops.length === 0 && newText === undefined) throw new SlideValidationError(["Amallar ro'yxati bo'sh"]);
  if (ops.length > MAX_ITEM_OPS) throw new SlideValidationError([`Bir chaqiruvda ko'pi bilan ${MAX_ITEM_OPS} ta amal`]);

  const d0 = current.data ?? {};
  const original: any[] =
    k === "opt" ? (d0.options ?? []).map((o: any) => ({ ...o }))
      : k === "pair" ? (d0.pairs ?? []).map((p: any) => ({ ...p }))
      : k === "item" ? (d0.items ?? []).map((t: string) => ({ text: t }))
      : (d0.blanks ?? []).map((b: string[]) => ({ answers: [...b] }));
  // Ish ro'yxati: har yozuv asl itemId'ni eslab qoladi (yangilar — null)
  const work: { id: string | null; v: any }[] = original.map((v, i) => ({ id: `${k}-${i}`, v }));
  const removed = new Set<string>();
  const errs: string[] = [];
  const lines: string[] = [];
  const label = KIND_LABEL[k];
  const allowedFields: Record<ItemKind, string[]> = {
    opt: type === "POLL" ? ["text", "imageUrl"] : ["text", "correct", "imageUrl"],
    pair: ["left", "right"],
    item: ["text"],
    blank: ["answers"],
  };
  const fieldsOf = (op: ItemOp) => (["text", "correct", "imageUrl", "left", "right", "answers"] as const).filter((f) => op[f] !== undefined);
  const find = (op: ItemOp, n: number) => {
    if (!op.itemId) { errs.push(`${n}-amal: itemId kerak`); return -1; }
    if (!new RegExp(`^${k}-\\d+$`).test(op.itemId)) { errs.push(`${n}-amal: "${op.itemId}" bu savol uchun noto'g'ri itemId (${k}-0, ${k}-1, ...)`); return -1; }
    if (removed.has(op.itemId)) { errs.push(`${n}-amal: "${op.itemId}" shu chaqiruvda allaqachon olib tashlangan`); return -1; }
    const idx = work.findIndex((w) => w.id === op.itemId);
    if (idx < 0) errs.push(`${n}-amal: "${op.itemId}" topilmadi (get_slide'dagi items'ni qarang)`);
    return idx;
  };
  const setFields = (v: any, op: ItemOp) => {
    if (op.text !== undefined) v.text = cleanText(op.text, LIMITS.option);
    if (op.correct !== undefined) v.isCorrect = op.correct;
    if (op.imageUrl !== undefined) { if (op.imageUrl === null) delete v.imageUrl; else v.imageUrl = checkImageUrl(op.imageUrl); }
    if (op.left !== undefined) v.left = cleanText(op.left, LIMITS.option);
    if (op.right !== undefined) v.right = cleanText(op.right, LIMITS.option);
    if (op.answers !== undefined) v.answers = op.answers.map((a) => cleanText(a, LIMITS.option)).filter(Boolean);
  };
  const show = (v: any) => (k === "opt" ? fmtOpt(v, type === "POLL") : k === "pair" ? `${v.left} → ${v.right}` : k === "item" ? v.text : (v.answers ?? []).join(" / "));
  // SINGLE/DROPDOWN: bitta variantni to'g'ri qilish — qolganlari avtomatik noto'g'ri
  const exclusive = type === "SINGLE" || type === "DROPDOWN";

  ops.forEach((op, i) => {
    const n = i + 1;
    const bad = fieldsOf(op).filter((f) => !allowedFields[k].includes(f));
    if (bad.length) { errs.push(`${n}-amal: ${TYPE_LABELS[type]} savolida ${bad.map((b) => `"${b}"`).join(", ")} maydoni bo'lmaydi`); return; }
    try {
      if (op.op === "add") {
        if (op.itemId) { errs.push(`${n}-amal: add'da itemId berilmaydi`); return; }
        const v: any = k === "opt" ? { text: "", isCorrect: false } : k === "pair" ? { left: "", right: "" } : k === "item" ? { text: "" } : { answers: [] };
        setFields(v, op);
        if (exclusive && v.isCorrect) work.forEach((w) => (w.v.isCorrect = false));
        const pos = op.position === undefined ? work.length : Math.min(Math.max(op.position - 1, 0), work.length);
        work.splice(pos, 0, { id: null, v });
        lines.push(`➕ Yangi ${label} (${pos + 1}-o'rin): ${show(v)}`);
      } else if (op.op === "update") {
        const idx = find(op, n);
        if (idx < 0) return;
        if (fieldsOf(op).length === 0) { errs.push(`${n}-amal: o'zgartiriladigan maydon yo'q`); return; }
        const before = show(work[idx].v);
        setFields(work[idx].v, op);
        if (exclusive && op.correct === true) work.forEach((w, j) => { if (j !== idx) w.v.isCorrect = false; });
        lines.push(`✏️ ${idx + 1}-${label}: ${before} → ${show(work[idx].v)}`);
      } else if (op.op === "remove") {
        const idx = find(op, n);
        if (idx < 0) return;
        if (fieldsOf(op).length) { errs.push(`${n}-amal: remove'da boshqa maydon berilmaydi`); return; }
        lines.push(`➖ Olib tashlanadi (${idx + 1}-${label}): ${show(work[idx].v)}`);
        removed.add(op.itemId!);
        work.splice(idx, 1);
      } else {
        const idx = find(op, n);
        if (idx < 0) return;
        if (op.position === undefined) { errs.push(`${n}-amal: move uchun position kerak`); return; }
        const [entry] = work.splice(idx, 1);
        const pos = Math.min(Math.max(op.position - 1, 0), work.length);
        work.splice(pos, 0, entry);
        lines.push(`↕️ ${show(entry.v)}: ${idx + 1}-o'rin → ${pos + 1}-o'rin`);
      }
    } catch (e) {
      if (e instanceof SlideValidationError) errs.push(...e.errors.map((m) => `${n}-amal: ${m}`));
      else throw e;
    }
  });
  if (errs.length) throw new SlideValidationError(errs);

  const next: BuiltSlide = { ...current, data: JSON.parse(JSON.stringify(d0)) };
  const d = next.data;
  if (newText !== undefined) {
    const t = cleanText(newText, LIMITS.text);
    if (t !== d.text) lines.unshift(`✏️ Savol matni: ${d.text} → ${t}`);
    d.text = t;
  }
  if (k === "opt") d.options = work.map((w) => ({ ...w.v, isCorrect: type === "POLL" ? false : !!w.v.isCorrect }));
  else if (k === "pair") d.pairs = work.map((w) => ({ left: w.v.left, right: w.v.right }));
  else if (k === "item") d.items = work.map((w) => w.v.text); // REORDER: ro'yxat tartibi = to'g'ri tartib
  else d.blanks = work.map((w) => w.v.answers);

  const before = formatList(type, d0);
  const after = formatList(type, d);
  if (JSON.stringify(before) === JSON.stringify(after) && d.text === d0.text) {
    throw new SlideValidationError(["Natija hozirgi holat bilan bir xil — o'zgarish yo'q"]);
  }
  validateSlide(next);
  return { slide: next, lines, before, after };
}

// ---------- Turni almashtirish ----------
export const typeExtraShape = {
  text: z.string().max(LIMITS.text).optional().describe("Yangi savol matni (masalan FILL_BLANK uchun ___ bilan)"),
  options: z.array(z.object({ text: z.string().max(LIMITS.option), correct: z.boolean().optional(), imageUrl: z.string().max(LIMITS.url).optional() })).max(LIMITS.maxOptions).optional(),
  correct: z.array(z.number().int().min(0).max(LIMITS.maxOptions - 1)).max(LIMITS.maxOptions).optional().describe("Saqlanadigan variantlardan qaysilari to'g'ri (0 dan)"),
  statementIsTrue: z.boolean().optional(),
  answers: z.array(z.string().max(LIMITS.option)).max(LIMITS.maxAnswers).optional(),
  blanks: z.array(z.array(z.string().max(LIMITS.option)).min(1).max(LIMITS.maxBlankAnswers)).max(LIMITS.maxBlanks).optional(),
  pairs: z.array(z.object({ left: z.string().max(LIMITS.option), right: z.string().max(LIMITS.option) })).max(LIMITS.maxPairs).optional(),
  items: z.array(z.string().max(LIMITS.option)).max(LIMITS.maxItems).optional(),
};
const typeExtraSchema = z.object(typeExtraShape);
export type TypeExtra = z.infer<typeof typeExtraSchema>;

/**
 * Savol turini almashtiradi. Mos keladigan ma'lumot (matn, rasm, vaqt, ball, izoh, variant
 * matnlari) saqlanadi; mos kelmaydigani `lost` ro'yxatida aniq ko'rsatiladi. Yangi turga
 * kerakli, lekin eski slayddan olib bo'lmaydigan maydonlar `extra` orqali beriladi.
 */
export function changeType(current: BuiltSlide, newType: QType, extra: TypeExtra): { slide: BuiltSlide; kept: string[]; lost: string[] } {
  if (current.kind !== "QUESTION") throw new SlideValidationError(["Kontent slaydni savolga aylantirib bo'lmaydi — yangi slayd qo'shing (add_slide)"]);
  if (!QTYPES.includes(newType)) throw new SlideValidationError([`Noma'lum tur: ${newType}`]);
  const oldType = current.type as QType;
  if (oldType === newType) throw new SlideValidationError(["Slayd allaqachon shu turda"]);
  const d = current.data ?? {};
  const oldOpts: any[] = OPTION_TYPES.includes(oldType) ? d.options ?? [] : [];
  const kept: string[] = ["Savol matni", "Vaqt", "Ball"];
  if (d.imageUrl) kept.push("Rasm");
  if (current.notes) kept.push("Ustoz izohi");
  const lost: string[] = [];

  const input: SlideInput = { kind: "QUESTION", type: newType, text: extra.text ?? d.text, notes: current.notes ?? undefined, timeLimit: current.timeLimit, points: current.points };
  const fromOptions = OPTION_TYPES.includes(oldType) && oldType !== "TRUE_FALSE";
  const correctIdx = oldOpts.map((o, i) => (o.isCorrect ? i : -1)).filter((i) => i >= 0);

  // Qoida: eski turdagi asosiy ma'lumot (variantlar/juftliklar/...) yangi turga ko'chirilmasa —
  // har doim "yo'qoladi" ro'yxatiga tushadi (extra bilan yangisi berilgan bo'lsa ham).
  let carried = false;
  if (OPTION_TYPES.includes(newType) && newType !== "TRUE_FALSE") {
    if (extra.options) {
      input.options = extra.options;
      if (fromOptions) { lost.push(`Eski variantlar (${oldOpts.length} ta) — yangilari bilan almashtiriladi`); carried = true; }
    } else if (fromOptions || oldType === "REORDER") {
      carried = true;
      const texts: string[] = fromOptions ? oldOpts.map((o) => o.text) : d.items ?? [];
      let corr = new Set<number>(extra.correct ?? (fromOptions ? correctIdx : []));
      if ((newType === "SINGLE" || newType === "DROPDOWN") && corr.size > 1 && !extra.correct) {
        const first = Math.min(...corr);
        lost.push(`Ortiqcha to'g'ri javob belgilari (faqat birinchisi qoladi: ${texts[first]})`);
        corr = new Set([first]);
      }
      if (newType === "POLL" && corr.size > 0) { lost.push("To'g'ri javob belgilari (so'rovnomada bo'lmaydi)"); corr = new Set(); }
      input.options = texts.map((t, i) => ({ text: t, correct: corr.has(i) }));
      kept.push(fromOptions ? "Variant matnlari" : "Tartib elementlari → variantlar");
      if (oldType === "REORDER") lost.push("To'g'ri tartib");
    }
  } else if (newType === "TRUE_FALSE") {
    if (extra.statementIsTrue === undefined) throw new SlideValidationError(["To'g'ri/Noto'g'ri turiga o'tish uchun statementIsTrue (true/false) kerak"]);
    input.statementIsTrue = extra.statementIsTrue;
  } else if (newType === "OPEN") {
    if (extra.answers) input.answers = extra.answers;
    else if (fromOptions && oldType !== "POLL" && correctIdx.length) {
      input.answers = correctIdx.map((i) => oldOpts[i].text);
      kept.push("To'g'ri variantlar → qabul qilinadigan javoblar");
      lost.push("Noto'g'ri variantlar");
      carried = true;
    } else input.answers = [];
  } else if (newType === "REORDER") {
    if (extra.items) input.items = extra.items;
    else if (fromOptions) {
      input.items = oldOpts.map((o) => o.text);
      kept.push("Variant matnlari → tartib elementlari (hozirgi tartib to'g'ri deb olinadi)");
      if (oldType !== "POLL" && correctIdx.length) lost.push("To'g'ri javob belgilari");
      carried = true;
    }
  } else if (newType === "MATCH") {
    if (!extra.pairs) throw new SlideValidationError(["Juftlash turiga o'tish uchun pairs (juftliklar) kerak"]);
    input.pairs = extra.pairs;
  } else if (newType === "FILL_BLANK") {
    if (!extra.blanks) throw new SlideValidationError(["Bo'sh joyni to'ldirish turiga o'tish uchun blanks va matnda ___ kerak (text bilan bering)"]);
    input.blanks = extra.blanks;
  }
  if (!carried) lost.push(...lostOf(oldType, d));

  // Rasm va variant rasmlari xom holida ko'chiriladi (eski importlarda boshqa CDN bo'lishi mumkin)
  const built = buildSlide(input);
  if (d.imageUrl) built.data.imageUrl = d.imageUrl;
  if (OPTION_TYPES.includes(newType) && newType !== "TRUE_FALSE" && fromOptions && !extra.options) {
    built.data.options = built.data.options.map((o: any, i: number) => (oldOpts[i]?.imageUrl ? { ...o, imageUrl: oldOpts[i].imageUrl } : o));
  }
  validateSlide(built);
  return { slide: built, kept, lost: [...new Set(lost)] };
}

function lostOf(type: QType, d: any): string[] {
  if (OPTION_TYPES.includes(type)) return [`Variantlar (${(d.options ?? []).length} ta)`];
  if (type === "OPEN") return (d.answers ?? []).length ? [`Qabul qilinadigan javoblar (${d.answers.length} ta)`] : [];
  if (type === "FILL_BLANK") return [`Bo'sh joy javoblari (${(d.blanks ?? []).length} ta)`];
  if (type === "MATCH") return [`Juftliklar (${(d.pairs ?? []).length} ta)`];
  if (type === "REORDER") return [`Tartib elementlari (${(d.items ?? []).length} ta)`];
  return [];
}
