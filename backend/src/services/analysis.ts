import { prisma } from "../prisma.js";
import { nameKey } from "../lib/nameKey.js";
import { num, parseCSV, nameMatch } from "./stats.js";

// Toifa tahlili — Telegram botdagi (Robbit Statistics) mantiq sayt uchun qayta ishlangan.
// Oylik statistika varaqlari statistika Sheet'idan nomi bo'yicha (gviz CSV) olinadi,
// ustozning hozirgi toifasi esa saytdagi RosterTeacher (O'qituvchilar bo'limi) dan.
const SHEET_ID = "1asJpws1tN-3YJNl15IQEeBTl8iIEePXjNy5Ri769fis";
const gvizUrl = (sheet?: string) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv${sheet ? `&sheet=${encodeURIComponent(sheet)}` : ""}`;

const UZB_MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

// Jadvaldagi "Umumiy/Jami" kabi xizmat qatorlari — ustoz emas
const IGNORE_NAMES = ["umumiy", "jami", "ortacha", "o'rtacha", "minimal", "talab", "rank", "ustozlar", "filial"];

// Keyingi toifaga o'tish talablari (toifa -> talab):
//   uv — uy vazifa bajarilishi kamida (%), davomat — kamida (%),
//   ketgan — ko'pi bilan (%), kechUv — uy vazifani kech tekshirish ko'pi bilan (%),
//   kechikish — oxirgi oyda ko'pi bilan (daqiqa)
const REQUIREMENTS: Record<number, { uv: number; davomat: number; ketgan: number; kechUv: number; kechikish: number }> = {
  2: { uv: 70, davomat: 80, ketgan: 10, kechUv: 6, kechikish: 10 },
  3: { uv: 80, davomat: 85, ketgan: 8, kechUv: 4, kechikish: 10 },
  4: { uv: 85, davomat: 85, ketgan: 6, kechUv: 2, kechikish: 10 },
};

export const GURUH_LIMITLARI: Record<number, string> = {
  1: "2 tagacha 3 kunlik guruh va 1 ta 1 kunlik guruh",
  2: "4 tagacha 3 kunlik guruh va 1 ta 1 kunlik guruh",
  3: "6 tagacha 3 kunlik guruh va 2 ta 1 kunlik guruh",
  4: "5 tagacha 3 kunlik guruh",
};

// 20-sana qoidasi: oyning 20-sanasidan boshlab joriy oy ham hisobga kiradi,
// undan oldin esa o'tgan oydan boshlanadi. limit tagacha oy nomi qaytadi
// (eng yangi birinchi). Varaq nomlarida yil yo'q, shuning uchun 12 tadan oshmaydi.
export function getTargetMonths(now = new Date(), limit = 3): string[] {
  const ref = now.getDate() >= 20 ? now : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const months: string[] = [];
  for (let i = 0; i < Math.min(limit, 12); i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    months.push(UZB_MONTHS[d.getMonth()]);
  }
  return months;
}

export interface MonthMetrics {
  month: string;
  uvBajarish: number | null; // uy vazifa bajarilishi, % (100 - bajarmagan)
  davomat: number | null; // o'quvchilar davomati, %
  ketgan: number | null; // ketgan o'quvchilar, %
  kechUv: number | null; // uy vazifani kech tekshirish, %
  kechikish: number | null; // kechikish, daqiqa
  umumiyBall: number | null;
}

export interface TierCheck {
  key: "uv" | "davomat" | "ketgan" | "kechUv" | "kechikish";
  label: string;
  value: number | null; // ustozning ko'rsatkichi (3 oylik o'rtacha; kechikish — oxirgi oy)
  required: number; // talab chegarasi
  direction: "min" | "max"; // min — kamida shuncha, max — ko'pi bilan shuncha
  ok: boolean;
}

export interface TeacherAnalysis {
  name: string;
  nameKey: string;
  branch: string | null;
  currentTier: number;
  targetTier: number;
  guruhLimit: string;
  months: MonthMetrics[]; // eng yangi oy birinchi (faqat mavjud varaqlar)
  latestMonth: string | null;
  checks: TierCheck[]; // maqsad toifa talablari bo'yicha holat
  passed: boolean; // barcha talab bajarilganmi
  isExpert: boolean; // 4-toifa (yuqoriga o'tish yo'q)
}

// ---- Oylik varaq keshi ----
// O'tgan oylar deyarli o'zgarmaydi, joriy oy kun davomida to'ldiriladi — 3 soat yetarli.
const MONTH_TTL_MS = 3 * 60 * 60 * 1000;
const monthCache = new Map<string, { rows: string[][] | null; ts: number }>();
let defaultSheetCache: { text: string; ts: number } | null = null;

async function fetchText(url: string): Promise<string> {
  // 10s timeout — Sheet osilib qolsa so'rov cheksiz kutmasin
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Sheet o'qib bo'lmadi (${res.status})`);
  return res.text();
}

// Google gviz noto'g'ri varaq nomiga xato bermaydi — default varaqni qaytaraveradi.
// Shu sabab oy varag'i defaultga aynan teng bo'lsa, varaq yo'q deb hisoblaymiz.
// (export — stats.ts reytingda kechikishni oy varag'idan olishi uchun ham ishlatiladi)
export async function fetchMonthRows(month: string): Promise<string[][] | null> {
  const hit = monthCache.get(month);
  if (hit && Date.now() - hit.ts < MONTH_TTL_MS) return hit.rows;

  if (!defaultSheetCache || Date.now() - defaultSheetCache.ts >= MONTH_TTL_MS) {
    defaultSheetCache = { text: await fetchText(gvizUrl()), ts: Date.now() };
  }
  const text = await fetchText(gvizUrl(month));
  // Bo'sh qatorlarni tashlab yuboramiz — varaqlarda o'n minglab bo'sh qator bor,
  // ularni keshda saqlash xotirani behuda yeydi
  const rows = text === defaultSheetCache.text ? null : parseCSV(text).filter((r) => r.some((c) => c && c.trim()));
  monthCache.set(month, { rows, ts: Date.now() });
  return rows;
}

// ---- Ustunlarni sarlavhadan aniqlash ----
// Oylik varaqlarda ustunlar siljiydi (masalan, May'da "HH ID" yo'q), shuning uchun
// indekslar qat'iy emas — sarlavha matnidan qidiriladi. gviz ikki qatorli sarlavhani
// bitta qatorga birlashtirib beradi (ichida \n bilan).
export interface Cols {
  name: number;
  ketgan: number;
  bajarmagan: number;
  kechikish: number;
  davomat: number;
  kechUv: number;
  umumiy: number;
}

export function detectCols(header: string[]): Cols | null {
  const H = header.map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
  const find = (pred: (h: string) => boolean) => H.findIndex((h) => h && pred(h));

  const name = find((h) => h.includes("ism-familiya") || h.includes("ism familiya"));
  if (name === -1) return null;

  // "Ketganlar ... Soni" dan keyingi "Foiz" ustuni — ketganlar foizi
  const ketganSoni = find((h) => h.includes("ketgan"));
  let ketgan = -1;
  if (ketganSoni !== -1) {
    for (let k = ketganSoni + 1; k < Math.min(ketganSoni + 4, H.length); k++) {
      if (H[k].includes("foiz")) { ketgan = k; break; }
    }
  }

  return {
    name,
    ketgan,
    bajarmagan: find((h) => h.includes("bajarmagan")), // "Uy vazifa Bajarmagan ... Foiz" — o'zi foiz
    kechikish: find((h) => h.includes("kechikish") && h.includes("daqiqa")),
    davomat: find((h) => h.includes("davomati")), // "O'quvchilar davomati ..."
    kechUv: find((h) => h.includes("kech tekshir")), // "Uy vazifani kech tekshirish"
    umumiy: find((h) => h.includes("umumiy ball")),
  };
}

const at = (r: string[], i: number): number | null => (i === -1 ? null : num(r[i]));

// ---- Tahlil ----
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function avgOf(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v != null);
  if (!nums.length) return null;
  return round1(nums.reduce((a, b) => a + b, 0) / nums.length);
}

// RosterTeacher.category dan toifa raqamini ajratish ("3", "3-toifa", "Toifa 3" ...)
function parseTier(category: string | null): number {
  const m = /\d/.exec(category ?? "");
  const t = m ? Number(m[0]) : 1;
  return t >= 1 && t <= 4 ? t : 1;
}

export async function getAllAnalyses(monthLimit = 3): Promise<{ months: string[]; analyses: TeacherAnalysis[] }> {
  const candidates = getTargetMonths(new Date(), monthLimit);
  const [allSheets, roster] = await Promise.all([
    Promise.all(candidates.map((m) => fetchMonthRows(m).catch(() => null))),
    prisma.rosterTeacher.findMany({ select: { name: true, nameKey: true, category: true, branch: true } }),
  ]);

  // Eng yangi (joriy) oy varag'i hali OCHILMAGAN bo'lishi mumkin — bu oddiy holat
  // (ofis hali shu oy varag'ini yaratmagan), xato emas. Shuning uchun boshidagi
  // bunday "yo'q" oylarni o'tkazib yuboramiz. Biroq haqiqiy ma'lumot topilgandan
  // KEYIN uchragan uzilishda to'xtaymiz: varaq nomlarida yil yo'q, shuning uchun
  // uzilishdan keyingi nomdosh varaq boshqa (o'tgan yilgi) davrga tegishli bo'lib
  // chiqishi mumkin.
  let start = 0;
  while (start < allSheets.length && !allSheets[start]) start++;
  let cut = allSheets.findIndex((s, i) => i >= start && (!s || s.length < 2));
  if (cut === -1) cut = allSheets.length;
  const targetMonths = candidates.slice(start, cut);
  const sheets = allSheets.slice(start, cut);

  // Har bir ustoz uchun oyma-oy ko'rsatkichlarni yig'amiz (kaliti — nameKey)
  const byKey = new Map<string, { name: string; branch: string | null; months: MonthMetrics[] }>();
  const availableMonths: string[] = [];

  for (let mi = 0; mi < targetMonths.length; mi++) {
    const rows = sheets[mi];
    if (!rows || rows.length < 2) continue;
    const cols = detectCols(rows[0]);
    if (!cols) continue;
    availableMonths.push(targetMonths[mi]);

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const rawName = String(r[cols.name] ?? "").trim();
      if (!rawName || IGNORE_NAMES.includes(rawName.toLowerCase())) continue;
      const metrics: MonthMetrics = {
        month: targetMonths[mi],
        uvBajarish: (() => {
          const b = at(r, cols.bajarmagan);
          return b == null ? null : round1(Math.max(0, 100 - b));
        })(),
        davomat: at(r, cols.davomat),
        ketgan: at(r, cols.ketgan),
        kechUv: at(r, cols.kechUv),
        kechikish: at(r, cols.kechikish),
        umumiyBall: at(r, cols.umumiy),
      };
      // Hech bo'lmasa bitta ko'rsatkichi bor qatorlar — haqiqiy ustoz qatori
      if (metrics.davomat == null && metrics.uvBajarish == null && metrics.ketgan == null) continue;
      const key = nameKey(rawName);
      if (!key) continue;
      let entry = byKey.get(key);
      if (!entry) {
        entry = { name: rawName, branch: null, months: [] };
        byKey.set(key, entry);
      }
      if (!entry.months.some((m) => m.month === targetMonths[mi])) entry.months.push(metrics);
    }
  }

  // Toifa: roster'dan (aniq nameKey mosligi, bo'lmasa fuzzy)
  const tierFor = (name: string, key: string): { tier: number; branch: string | null } => {
    const exact = roster.find((t) => t.nameKey === key);
    const found = exact ?? roster.find((t) => nameMatch(t.name, name));
    return { tier: parseTier(found?.category ?? null), branch: found?.branch ?? null };
  };

  const analyses: TeacherAnalysis[] = [];
  for (const [key, entry] of byKey) {
    const { tier, branch } = tierFor(entry.name, key);
    const isExpert = tier >= 4;
    const targetTier = isExpert ? 4 : tier + 1;
    const req = REQUIREMENTS[targetTier];

    // Toifa talablari HAR DOIM oxirgi 3 oy o'rtachasi bo'yicha (davr tanlovi
    // faqat grafiklarga ta'sir qiladi — biznes-qoida o'zgarmaydi)
    const recent = entry.months.slice(0, 3);
    const avgUv = avgOf(recent.map((m) => m.uvBajarish));
    const avgDav = avgOf(recent.map((m) => m.davomat));
    const avgKet = avgOf(recent.map((m) => m.ketgan));
    const avgKechUv = avgOf(recent.map((m) => m.kechUv));
    const latest = entry.months[0] ?? null; // eng yangi oy birinchi turadi
    const lat = latest?.kechikish ?? null;

    const checks: TierCheck[] = [
      { key: "uv", label: "Uy vazifa bajarilishi", value: avgUv, required: req.uv, direction: "min", ok: avgUv != null && avgUv >= req.uv },
      { key: "davomat", label: "Davomat", value: avgDav, required: req.davomat, direction: "min", ok: avgDav != null && avgDav >= req.davomat },
      { key: "ketgan", label: "Ketgan o'quvchilar", value: avgKet, required: req.ketgan, direction: "max", ok: avgKet != null && avgKet <= req.ketgan },
      { key: "kechUv", label: "Uy vazifani kech tekshirish", value: avgKechUv, required: req.kechUv, direction: "max", ok: avgKechUv != null && avgKechUv <= req.kechUv },
      { key: "kechikish", label: `Kechikish (${latest?.month ?? "oxirgi oy"})`, value: lat, required: req.kechikish, direction: "max", ok: lat != null && lat <= req.kechikish },
    ];

    analyses.push({
      name: entry.name,
      nameKey: key,
      branch,
      currentTier: tier,
      targetTier,
      guruhLimit: GURUH_LIMITLARI[tier] ?? "",
      months: entry.months,
      latestMonth: latest?.month ?? null,
      checks,
      passed: checks.every((c) => c.ok),
      isExpert,
    });
  }

  analyses.sort((a, b) => a.name.localeCompare(b.name, "uz"));
  return { months: availableMonths, analyses };
}

export async function getAnalysisByName(name: string, monthLimit = 3): Promise<TeacherAnalysis | null> {
  const key = nameKey(name);
  if (!key) return null;
  const { analyses } = await getAllAnalyses(monthLimit);
  return analyses.find((a) => a.nameKey === key) ?? analyses.find((a) => nameMatch(a.name, name)) ?? null;
}
