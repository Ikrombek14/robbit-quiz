import { prisma } from "../prisma.js";
import { nameKey, looseNameKey } from "../lib/nameKey.js";
import { num, parseCSV, nameMatch, resolveByName } from "./stats.js";

// Toifa tahlili — Telegram botdagi (Robbit Statistics) mantiq sayt uchun qayta ishlangan.
// Oylik statistika varaqlari statistika Sheet'idan nomi bo'yicha (gviz CSV) olinadi,
// ustozning hozirgi toifasi esa saytdagi RosterTeacher (O'qituvchilar bo'limi) dan.
const SHEET_ID = "1asJpws1tN-3YJNl15IQEeBTl8iIEePXjNy5Ri769fis";
const gvizUrl = (sheet?: string) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv${sheet ? `&sheet=${encodeURIComponent(sheet)}` : ""}`;
const defaultExportUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

const UZB_MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];

// Jadvaldagi "Umumiy/Jami" kabi xizmat qatorlari — ustoz emas
const IGNORE_NAMES = ["umumiy", "jami", "ortacha", "o'rtacha", "minimal", "talab", "rank", "ustozlar", "filial"];

// Keyingi toifaga o'tish talablari (toifa -> talab):
//   uv — uy vazifa bajarilishi kamida (%), davomat — kamida (%),
//   ketgan — ko'pi bilan (%), kechikish — oxirgi oyda ko'pi bilan (daqiqa)
// ("Uy vazifani kech tekshirish" ko'rsatkichi ariza talabiga KIRMAYDI — faqat
// ma'lumot uchun oylik faoliyat grafigida ko'rsatiladi, checks/passed'ga ta'sir qilmaydi)
const REQUIREMENTS: Record<number, { uv: number; davomat: number; ketgan: number; kechikish: number }> = {
  2: { uv: 70, davomat: 80, ketgan: 10, kechikish: 10 },
  3: { uv: 80, davomat: 85, ketgan: 8, kechikish: 10 },
  4: { uv: 85, davomat: 85, ketgan: 6, kechikish: 10 },
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
  name: string; // eng yangi oy varag'idagi yozilishi
  nameKey: string;
  aliases: string[]; // shu ustozning turli oylardagi barcha yozilishlari (Sheet'da ism o'zgarib turadi)
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

async function fetchText(url: string): Promise<string> {
  // 10s timeout — Sheet osilib qolsa so'rov cheksiz kutmasin
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Sheet o'qib bo'lmadi (${res.status})`);
  return res.text();
}

// ---- Defolt varaqning HAQIQIY nomi (faqat sarlavha, HEAD so'rov bilan) ----
// export?format=csv so'rovida sheet/gid ko'rsatilmasa, joriy DEFOLT varaq qaytadi va
// javobning Content-Disposition sarlavhasida o'sha varaqning haqiqiy nomi bo'ladi
// (masalan "...- Avgust.csv"). Bu bizga aniq bilish imkonini beradi: agar so'ralgan oy
// nomi aynan shu nomga teng bo'lsa, defolt varaq HAQIQATDA o'sha oyga tegishli — tasodif
// emas (2026-08'da ofis "Avgust" varag'ini xuddi joriy/asosiy varaqning o'zi qilib
// qo'ygan, natijada eski gviz-fallback heuristikasi buni noto'g'ri "yo'q" deb hisoblardi).
// MUHIM: bu faqat NOMNI aniqlash uchun ishlatiladi — export'ning CSV formati gviz'dan
// farq qiladi (sarlavha ikki qatorga bo'lingan, gviz esa birlashtirib beradi), shuning
// uchun haqiqiy qatorlar HAR DOIM gviz'dan olinadi (pastda).
let defaultNameCache: { name: string | null; ts: number } | null = null;

async function getDefaultSheetName(): Promise<string | null> {
  if (defaultNameCache && Date.now() - defaultNameCache.ts < MONTH_TTL_MS) return defaultNameCache.name;
  const res = await fetch(defaultExportUrl, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Sheet o'qib bo'lmadi (${res.status})`);
  const disp = res.headers.get("content-disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)/.exec(disp);
  let name: string | null = null;
  if (m) {
    const decoded = decodeURIComponent(m[1]).replace(/\.csv$/i, "");
    const parts = decoded.split(" - ");
    name = parts[parts.length - 1]?.trim() || null;
  }
  defaultNameCache = { name, ts: Date.now() };
  return name;
}

let gvizDefaultCache: { text: string; ts: number } | null = null;

async function getGvizDefaultText(): Promise<string> {
  if (gvizDefaultCache && Date.now() - gvizDefaultCache.ts < MONTH_TTL_MS) return gvizDefaultCache.text;
  const text = await fetchText(gvizUrl());
  gvizDefaultCache = { text, ts: Date.now() };
  return text;
}

export async function fetchMonthRows(month: string): Promise<string[][] | null> {
  const hit = monthCache.get(month);
  if (hit && Date.now() - hit.ts < MONTH_TTL_MS) return hit.rows;

  const [defaultName, gvizDefaultText] = await Promise.all([getDefaultSheetName(), getGvizDefaultText()]);
  let text: string;
  if (month === defaultName) {
    // Content-Disposition orqali TASDIQLANGAN holda shu oyga tegishli — qayta so'rab
    // tasodifiy moslikni tekshirishning hojati yo'q.
    text = gvizDefaultText;
  } else {
    text = await fetchText(gvizUrl(month));
    // Google gviz noto'g'ri/mavjud bo'lmagan varaq nomiga xato bermaydi — defolt
    // varaqni qaytaraveradi. Defolt HAQIQATDA boshqa oyga tegishli ekani yuqorida
    // tasdiqlangan, shuning uchun natija defolt bilan bir xil bo'lsa — demak bunday
    // varaq chindan ham yo'q (tasodifiy moslik emas).
    if (text === gvizDefaultText) {
      monthCache.set(month, { rows: null, ts: Date.now() });
      return null;
    }
  }
  // Bo'sh qatorlarni tashlab yuboramiz — varaqlarda o'n minglab bo'sh qator bor,
  // ularni keshda saqlash xotirani behuda yeydi
  const rows = parseCSV(text).filter((r) => r.some((c) => c && c.trim()));
  monthCache.set(month, { rows, ts: Date.now() });
  return rows;
}

// ---- Ustunlarni sarlavhadan aniqlash ----
// Oylik varaqlarda ustunlar siljiydi (masalan, May'da "HH ID" yo'q), shuning uchun
// indekslar qat'iy emas — sarlavha matnidan qidiriladi. gviz ikki qatorli sarlavhani
// bitta qatorga birlashtirib beradi (ichida \n bilan).
export interface Cols {
  hhId: number; // "HH ID" (2026-08 dan bor; eski varaqlarda -1)
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

  // Odatda "O'qituvchi Ism-Familiya"; Fevral varag'ida esa shunchaki "O'qituvchi"
  // (aks holda butun oy tahlildan jim tushib qolardi)
  let name = find((h) => h.includes("ism-familiya") || h.includes("ism familiya"));
  if (name === -1) name = find((h) => /^o[`'ʻʼ‘’]?qituvchi$/.test(h));
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
    hhId: find((h) => h.replace(/\s/g, "") === "hhid" || h.startsWith("hh id")),
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

export async function getAllAnalyses(
  monthLimit = 3
): Promise<{ months: string[]; analyses: TeacherAnalysis[]; expectedMonth: string; sheetsHealthy: boolean }> {
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

  // Har bir ustoz uchun oyma-oy ko'rsatkichlarni yig'amiz.
  // Bitta ustoz turli oylarda TURLICHA yozilishi mumkin (2026-10: Sheet'da "YULDASHEV
  // XOJIMUHAMMAD" (Iyun–Iyul) → "... NODIRBEK OGLI" (Avg–Sen) → "Yuldashev Xojimuhammad"
  // (Okt)). Faqat ism kaliti bo'yicha guruhlansa bitta odam bir necha kartaga bo'linib,
  // toifa talablari chala oylar bo'yicha tekshirilardi. Shu sabab oylar ENG YANGIDAN
  // eskisiga qarab yig'iladi va qator mavjud guruhga quyidagi tartibda biriktiriladi:
  //   1) HH ID bir xil (2026-08 dan har qatorda bor) — eng ishonchli;
  //   2) ism kaliti bir xil (HH ID'lar zid bo'lmasa);
  //   3) qisqa ism to'liq ismning ichida (kamida 2 so'z — familiya + ism): faqat YAGONA
  //      nomzod bo'lsa, HH ID'lar zid bo'lmasa va o'sha guruhda bu oy hali bo'lmasa
  //      (bir oyda ikki qator — ikki xil odam degani).
  // Shu oy guruhda allaqachon bo'lsa (takroriy qator) — birinchisi qoladi (avvalgidek).
  interface Group { name: string; hhIds: Set<string>; keys: Set<string>; tokens: Set<string>; aliases: Set<string>; months: MonthMetrics[] }
  const groups: Group[] = [];
  const tokensOf = (s: string) => new Set(looseNameKey(s).split(" ").filter(Boolean));
  const within = (a: Set<string>, b: Set<string>) => [...a].every((t) => b.has(t));
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
      const month = targetMonths[mi];
      const hhRaw = cols.hhId === -1 ? "" : String(r[cols.hhId] ?? "").trim();
      const hhId = /^\d+$/.test(hhRaw) ? hhRaw : "";
      const hhOk = (g: Group) => !hhId || g.hhIds.size === 0 || g.hhIds.has(hhId);
      const hasMonth = (g: Group) => g.months.some((m) => m.month === month);

      let g = hhId ? groups.find((x) => x.hhIds.has(hhId)) : undefined;
      if (!g) g = groups.find((x) => x.keys.has(key) && hhOk(x));
      if (!g) {
        const tk = tokensOf(rawName);
        const cands = groups.filter((x) =>
          Math.min(tk.size, x.tokens.size) >= 2 && (within(tk, x.tokens) || within(x.tokens, tk)) && hhOk(x) && !hasMonth(x));
        if (cands.length === 1) g = cands[0];
      }
      if (g && hasMonth(g)) continue; // shu oyda takroriy qator — birinchisi qoladi
      if (!g) {
        g = { name: rawName, hhIds: new Set(), keys: new Set(), tokens: new Set(), aliases: new Set(), months: [] };
        groups.push(g);
      }
      if (hhId) g.hhIds.add(hhId);
      g.keys.add(key);
      g.aliases.add(rawName);
      for (const t of tokensOf(rawName)) g.tokens.add(t);
      g.months.push(metrics);
    }
  }

  // Toifa: roster'dan (aniq nameKey mosligi, bo'lmasa fuzzy)
  const tierFor = (name: string, key: string): { tier: number; branch: string | null } => {
    const exact = roster.find((t) => t.nameKey === key);
    const found = exact ?? roster.find((t) => nameMatch(t.name, name));
    return { tier: parseTier(found?.category ?? null), branch: found?.branch ?? null };
  };

  const analyses: TeacherAnalysis[] = [];
  for (const entry of groups) {
    const key = nameKey(entry.name); // eng yangi oydagi yozilish
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
    const latest = entry.months[0] ?? null; // eng yangi oy birinchi turadi
    const lat = latest?.kechikish ?? null;

    const checks: TierCheck[] = [
      { key: "uv", label: "Uy vazifa bajarilishi", value: avgUv, required: req.uv, direction: "min", ok: avgUv != null && avgUv >= req.uv },
      { key: "davomat", label: "Davomat", value: avgDav, required: req.davomat, direction: "min", ok: avgDav != null && avgDav >= req.davomat },
      { key: "ketgan", label: "Ketgan o'quvchilar", value: avgKet, required: req.ketgan, direction: "max", ok: avgKet != null && avgKet <= req.ketgan },
      { key: "kechikish", label: `Kechikish (${latest?.month ?? "oxirgi oy"})`, value: lat, required: req.kechikish, direction: "max", ok: lat != null && lat <= req.kechikish },
    ];

    analyses.push({
      name: entry.name,
      nameKey: key,
      aliases: [...entry.aliases],
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
  // Sog'lomlik: 20-sana qoidasiga ko'ra ENG YANGI kutilgan varaq (candidates[0]) hali
  // topilmagan bo'lsa (ofis oy varag'ini yaratmagan) — admin buni ko'rishi kerak,
  // aks holda "ma'lumot yo'q" bilan "varaq yaratilmagan"ni farqlash qiyin.
  const expectedMonth = candidates[0];
  const sheetsHealthy = availableMonths[0] === expectedMonth;
  return { months: availableMonths, analyses, expectedMonth, sheetsHealthy };
}

export async function getAnalysisByName(name: string, monthLimit = 3): Promise<TeacherAnalysis | null> {
  if (!nameKey(name)) return null;
  const { analyses } = await getAllAnalyses(monthLimit);
  // Avval ustozning Sheet'dagi HAR QANDAY oydagi yozilishi bilan aniq moslik (masalan
  // profilida eski "... NODIRBEK OGLI" shakli turgan bo'lsa ham to'g'ri kartani topadi)
  const key = nameKey(name);
  const byAlias = analyses.filter((a) => a.aliases.some((x) => nameKey(x) === key));
  if (byAlias.length === 1) return byAlias[0];
  // Statistika bilan AYNAN bir xil qidiruv zanjiri (aniq → yumshoq → prefiks → 1-harf)
  return resolveByName(analyses, name);
}
