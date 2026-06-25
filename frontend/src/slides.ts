import type { QType, Slide, SlideData } from "./types";

export const QUESTION_TYPES: { type: QType; label: string; icon: string }[] = [
  { type: "SINGLE", label: "Bir javobli test", icon: "🔘" },
  { type: "MULTIPLE", label: "Bir nechta to'g'ri", icon: "☑️" },
  { type: "TRUE_FALSE", label: "To'g'ri / Noto'g'ri", icon: "✔️" },
  { type: "DROPDOWN", label: "Ochiluvchi (dropdown)", icon: "🔽" },
  { type: "POLL", label: "So'rovnoma (Poll)", icon: "📊" },
  { type: "OPEN", label: "Ochiq javob", icon: "✍️" },
  { type: "FILL_BLANK", label: "Bo'sh joyni to'ldirish", icon: "🧩" },
  { type: "MATCH", label: "Juftlash (Match)", icon: "🔗" },
  { type: "REORDER", label: "Tartiblash (Reorder)", icon: "↕️" },
];

export const TYPE_LABELS: Record<QType, string> = Object.fromEntries(
  QUESTION_TYPES.map((q) => [q.type, q.label]),
) as Record<QType, string>;

export function defaultData(type: QType): SlideData {
  switch (type) {
    case "TRUE_FALSE":
      return {
        text: "",
        options: [
          { text: "To'g'ri", isCorrect: true },
          { text: "Noto'g'ri", isCorrect: false },
        ],
      };
    case "OPEN":
      return { text: "", answers: [""] };
    case "FILL_BLANK":
      return { text: "Masalan: Yer ___ atrofida aylanadi.", blanks: [["Quyosh"]] };
    case "MATCH":
      return {
        text: "",
        pairs: [
          { left: "", right: "" },
          { left: "", right: "" },
        ],
      };
    case "REORDER":
      return { text: "", items: ["", "", ""] };
    case "POLL":
      return { text: "", options: [{ text: "", isCorrect: false }, { text: "", isCorrect: false }] };
    default:
      // SINGLE / MULTIPLE / DROPDOWN
      return {
        text: "",
        options: [
          { text: "", isCorrect: true },
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
          { text: "", isCorrect: false },
        ],
      };
  }
}

export function newQuestionSlide(type: QType): Slide {
  return { kind: "QUESTION", type, data: defaultData(type), timeLimit: 20, points: 1000, notes: "" };
}

export function newContentSlide(): Slide {
  // Bo'sh kanvas slayd (yangi format)
  return {
    kind: "CONTENT",
    type: null,
    data: { v: 2, background: { type: "color", value: "#ffffff" }, elements: [] },
    timeLimit: 20,
    points: 0,
    notes: "",
  };
}

export function slideTitle(s: Slide): string {
  if (s.kind === "CONTENT") {
    // Yangi format: birinchi matn elementidan sarlavha
    const els = s.data.elements;
    if (Array.isArray(els)) {
      const firstText = els.find((e) => e.type === "text" && (e as { text?: string }).text?.trim());
      if (firstText) return (firstText as { text: string }).text.trim().slice(0, 60);
      return "Slayd";
    }
    // Eski format
    return s.data.title?.trim() || "Slayd";
  }
  return s.data.text?.trim() || TYPE_LABELS[(s.type ?? "SINGLE") as QType] || "Savol";
}

export function normalize(s: string): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Mustaqil (self-paced) o'yin uchun javobni mahalliy tekshirish.
// answer: choice -> option indeksi(lar) string; open -> matn; fill -> string[]; match -> {leftId:rightId}; reorder -> id[]
export function checkAnswer(slide: Slide, answer: unknown): boolean {
  const d = slide.data;
  const t = slide.type;
  if (t === "POLL") return true;
  if (t === "OPEN") {
    const text = normalize(String(answer ?? ""));
    return (d.answers ?? []).some((a) => normalize(a) === text);
  }
  if (t === "FILL_BLANK") {
    const arr: string[] = Array.isArray(answer) ? answer.map(String) : [];
    const blanks = d.blanks ?? [];
    return blanks.length > 0 && blanks.every((acc, i) => acc.some((a) => normalize(a) === normalize(arr[i] ?? "")));
  }
  if (t === "MATCH") {
    const pairs = d.pairs ?? [];
    const map = answer && typeof answer === "object" && !Array.isArray(answer) ? (answer as Record<string, string>) : {};
    return pairs.length > 0 && pairs.every((_, i) => map[String(i)] === String(i));
  }
  if (t === "REORDER") {
    const items = d.items ?? [];
    const order: string[] = Array.isArray(answer) ? answer.map(String) : [];
    return items.length > 0 && order.length === items.length && order.every((id, i) => id === String(i));
  }
  const opts = d.options ?? [];
  const correctIds = opts.map((o, i) => ({ o, i })).filter((x) => x.o.isCorrect).map((x) => String(x.i)).sort();
  const selected = Array.isArray(answer) ? answer.map(String) : answer != null ? [String(answer)] : [];
  const sel = [...new Set(selected)].sort();
  return correctIds.length === sel.length && correctIds.every((id, i) => id === sel[i]);
}
