// ---- Dars bo'yicha baholash (davomat, uy vazifasi, quiz, amaliyot 1/2, odob) ----
//
// Har mezon 0–100 ball. Ustoz dars davomida tugmalar bilan belgilaydi (socket/game.ts),
// natija GamePlayerRecord.grades ga JSON sifatida yoziladi. Baholanmagan mezon
// (null — masalan, amaliyot berilmagan) "Jami"ga kirmaydi.

export const PENALTY = 10; // har kechikish / har odobsizlik uchun ayiriladigan ball

export interface BehaviorEvent {
  reason: string; // "Noutbuk yopilmagan", "O'yin o'ynadi", ... yoki ""
  at: number; // ms epoch
}

/** Ustoz belgilaydigan xom holat (o'yin xotirasida va bazada shu ko'rinishda). */
export interface Grades {
  late: number; // kechikishlar soni → davomat = 100 − 10×late
  homework: boolean | null; // oldingi dars uy vazifasi: qildi / qilmadi / belgilanmagan
  practice1: number | null; // 0–100
  practice2: number | null; // 0–100
  behavior: BehaviorEvent[]; // har biri −10
  // Quiz: har savolga max 100 ball (o'yin bali savol maksimumiga nisbatan 100 ga keltiriladi)
  quizSum: number;
  quizMax: number; // savollar soni × 100 (0 = quizda savol yo'q)
}

export function emptyGrades(): Grades {
  return { late: 0, homework: null, practice1: null, practice2: null, behavior: [], quizSum: 0, quizMax: 0 };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Bazadagi/snapshot'dagi JSON'ni xavfsiz o'qiydi (eski yozuvlarda maydonlar bo'lmasligi mumkin). */
export function parseGrades(raw: unknown): Grades {
  let g: any = raw;
  if (typeof raw === "string") {
    try {
      g = JSON.parse(raw || "{}");
    } catch {
      g = {};
    }
  }
  if (!g || typeof g !== "object") g = {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? clamp(v) : null);
  return {
    late: Number.isFinite(g.late) ? Math.max(0, Math.floor(g.late)) : 0,
    homework: typeof g.homework === "boolean" ? g.homework : null,
    practice1: num(g.practice1),
    practice2: num(g.practice2),
    behavior: Array.isArray(g.behavior)
      ? g.behavior.map((e: any) => ({ reason: String(e?.reason ?? "").slice(0, 80), at: Number(e?.at) || 0 }))
      : [],
    quizSum: Number.isFinite(g.quizSum) ? Math.max(0, g.quizSum) : 0,
    quizMax: Number.isFinite(g.quizMax) ? Math.max(0, g.quizMax) : 0,
  };
}

export interface Scores {
  attendance: number;
  homework: number | null;
  quiz: number | null; // 0–100 (quizSum / quizMax)
  practice1: number | null;
  practice2: number | null;
  behavior: number;
  total: number; // baholangan mezonlar yig'indisi
  max: number; // baholangan mezonlar soni × 100
  pct: number; // total / max, %
}

export const CRITERIA = ["attendance", "homework", "quiz", "practice1", "practice2", "behavior"] as const;
export type Criterion = (typeof CRITERIA)[number];

/** Xom holatdan 0–100 lik ballar va jami. */
export function computeScores(g: Grades): Scores {
  const s = {
    attendance: clamp(100 - PENALTY * g.late),
    homework: g.homework === null ? null : g.homework ? 100 : 0,
    quiz: g.quizMax > 0 ? clamp((g.quizSum / g.quizMax) * 100) : null,
    practice1: g.practice1,
    practice2: g.practice2,
    behavior: clamp(100 - PENALTY * g.behavior.length),
  };
  const vals = CRITERIA.map((c) => s[c]).filter((v): v is number => v !== null);
  const total = vals.reduce((a, b) => a + b, 0);
  const max = vals.length * 100;
  return { ...s, total, max, pct: max ? Math.round((total / max) * 100) : 0 };
}

/** Zich o'rin: 90, 90, 80 → 1, 1, 2. */
export function densePlaces(values: number[]): number[] {
  const uniq = [...new Set(values)].sort((a, b) => b - a);
  return values.map((v) => uniq.indexOf(v) + 1);
}

/** Ism kaliti — oylik statistikada bir o'quvchining darslarini birlashtirish uchun. */
export function nameKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[ʻʼ‘’`']/g, "'");
}

/** "2026-11" → [1-noyabr 00:00, 1-dekabr 00:00) Toshkent vaqti (UTC+5) bo'yicha. */
export function monthRange(month: string): { from: Date; to: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const from = new Date(Date.UTC(y, mo - 1, 1) - 5 * 3600_000);
  const to = new Date(Date.UTC(y, mo, 1) - 5 * 3600_000);
  return { from, to };
}

export function currentMonth(): string {
  const d = new Date(Date.now() + 5 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
