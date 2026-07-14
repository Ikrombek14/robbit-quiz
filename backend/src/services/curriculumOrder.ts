// O'quv dasturi darslarini AVTOMATIK tartiblash.
//
// Manba: rasmiy o'quv reja jadvallari (Google Sheets "O'QUV REJA" + ERP darsma-dars
// ro'yxati). Har (yo'nalish × yosh guruhi × bo'lim) uchun modullarning kanonik
// ketma-ketligi quyida konfiguratsiya qilingan.
//
// Tartib kaliti (kuchli → kuchsiz):
//   1) Sarlavhadagi aniq belgi "(d-35)" / "(D-16)" — reja bo'yicha aniq o'rin.
//   2) Modul kalit so'zi (masalan "tinkercad", "figma") → modulning boshlang'ich
//      pozitsiyasi + sarlavhadagi ichki raqam ("3-qism", "Figma 4-dars", "Spline 2").
//   3) Hech narsa topilmasa — ro'yxat oxiriga, mavjud tartib saqlangan holda.
//
// Kalit so'zlarda keng tarqalgan xatolar ham hisobga olingan ("figam" → figma,
// "onahape" → onshape, "elektrinika" → elektronika va h.k.).

export interface OrderGroup {
  subject: string; // ROBOTEXNIKA | DASTURLASH
  ageGroup: string; // MIDDLE | SENIOR
  year: number;
  section: string | null; // DESIGN | PROGRAMMING | ROBOTICS | null
}

interface ModuleDef {
  // Kichik harfda qidiriladigan kalit so'zlar (typo variantlari bilan)
  keywords: string[];
  // Kanonik boshlang'ich pozitsiya (darsma-dars reja ma'lum bo'lsa — haqiqiy
  // dars raqami; aks holda modul tartib nomeri × 100)
  start: number;
}

// ---- Modul ketma-ketliklari (o'quv reja jadvallaridan) ----------------------

// ROBOTEXNIKA · MIDDLE (9–11) · DESIGN — ERP darsma-dars ro'yxati (1–38)
const ROBO_MIDDLE_DESIGN: ModuleDef[] = [
  { keywords: ["kompyuter", "komputer", "keyboard", "mouse", "qurilma", "qurulma"], start: 1 },
  { keywords: ["google docs", "google sheets", "google"], start: 2 },
  { keywords: ["ai ", "teachable", "gemini", "prompt", "notebooklm", "video gener", "video yasash", "app builder", "mini app", "tasvir"], start: 5 },
  { keywords: ["tinkercad", "tinkercard"], start: 11 },
  { keywords: ["canva"], start: 17 },
  { keywords: ["yakuniy nazorat", "foundation"], start: 19 },
  { keywords: ["figma", "figam"], start: 20 },
  { keywords: ["figjam"], start: 27 },
  { keywords: ["spline"], start: 29 },
  { keywords: ["onshape", "onahape", "onshap"], start: 34 },
];

// ROBOTEXNIKA · MIDDLE · PROGRAMMING — oylik reja: Scratch → Python → AppInventor → Web
const ROBO_MIDDLE_PROG: ModuleDef[] = [
  { keywords: ["scratch"], start: 100 },
  { keywords: ["python", "turtle"], start: 200 },
  { keywords: ["app inventor", "appinventor", "appinvntor"], start: 300 },
  { keywords: ["html", "css", "web", "sayt"], start: 400 },
];

// ROBOTEXNIKA · MIDDLE · ROBOTICS — WeDo → Spike → Elektronika → Arduino → Musobaqa → IoT
const ROBO_MIDDLE_ROBOTICS: ModuleDef[] = [
  { keywords: ["wedo", "we do"], start: 100 },
  { keywords: ["spike"], start: 200 },
  { keywords: ["elektronika", "elektrinika", "eelktronika", "electronika"], start: 300 },
  { keywords: ["arduino", "arduoino", "arduno"], start: 400 },
  { keywords: ["musobaqa", "robo-futbol", "labirint", "sumo"], start: 500 },
  { keywords: ["esp32", "iot", "mqtt", "blynk"], start: 600 },
];

// ROBOTEXNIKA · SENIOR (12–15) — oylik reja
const ROBO_SENIOR_DESIGN: ModuleDef[] = [
  { keywords: ["tinkercad", "tinkercard"], start: 100 },
  { keywords: ["onshape", "onahape", "onshap"], start: 200 },
];
const ROBO_SENIOR_PROG: ModuleDef[] = [
  { keywords: ["scratch"], start: 100 },
  { keywords: ["python", "turtle"], start: 200 },
  { keywords: ["app inventor", "appinventor", "appinvntor"], start: 300 },
];
const ROBO_SENIOR_ROBOTICS: ModuleDef[] = [
  { keywords: ["spike"], start: 100 },
  { keywords: ["elektronika", "elektrinika", "eelktronika", "electronika"], start: 200 },
  { keywords: ["arduino", "arduoino", "arduno"], start: 300 },
  { keywords: ["musobaqa", "robo-futbol", "labirint", "sumo"], start: 400 },
  { keywords: ["esp32", "iot", "mqtt", "blynk"], start: 500 },
];

// DASTURLASH · MIDDLE (9–11) — 24 oylik reja (1-yil: Scratch→JS, 2-yil: Python→Final)
const DAST_MIDDLE: ModuleDef[] = [
  { keywords: ["scratch"], start: 100 },
  { keywords: ["figma", "figam"], start: 200 },
  { keywords: ["framer"], start: 300 },
  { keywords: ["github"], start: 400 },
  { keywords: ["html"], start: 500 },
  { keywords: ["css", "flexbox", "layout"], start: 600 },
  { keywords: ["responsive"], start: 700 },
  { keywords: ["javascript", "java script", " js "], start: 800 },
  { keywords: ["python", "turtle"], start: 900 },
  { keywords: ["telegram", "bot "], start: 1000 },
  { keywords: ["sqlite", "database", "baza"], start: 1100 },
  { keywords: ["api", "webhook"], start: 1200 },
  { keywords: ["aiogram"], start: 1300 },
  { keywords: ["algoritm", "puzzle"], start: 1400 },
  { keywords: ["final", "yakuniy loyiha"], start: 1500 },
];

// DASTURLASH · SENIOR (12–15) — 18 oylik reja
const DAST_SENIOR: ModuleDef[] = [
  { keywords: ["scratch"], start: 100 },
  { keywords: ["figma", "figam", "framer"], start: 200 },
  { keywords: ["github"], start: 300 },
  { keywords: ["html"], start: 400 },
  { keywords: ["css", "flexbox", "grid"], start: 500 },
  { keywords: ["javascript", "java script", " js ", "dom"], start: 600 },
  { keywords: ["telegram", "botfather", "no-code", "nocode"], start: 700 },
  { keywords: ["python", "turtle"], start: 800 },
  { keywords: ["sqlite", "database", "baza"], start: 900 },
  { keywords: ["api", "json"], start: 1000 },
  { keywords: ["aiogram"], start: 1100 },
  { keywords: ["algoritm", "big o", "leetcode"], start: 1200 },
  { keywords: ["final", "yakuniy loyiha"], start: 1300 },
];

// Guruh → modul ro'yxati. Yil kesib o'tilmaydi: tartib faqat guruh ichida
// solishtiriladi, shuning uchun bir yo'nalishning barcha yillari uchun bitta
// umumiy ketma-ketlik yetarli.
function modulesFor(group: OrderGroup): ModuleDef[] {
  if (group.subject === "DASTURLASH") {
    return group.ageGroup === "SENIOR" ? DAST_SENIOR : DAST_MIDDLE;
  }
  // ROBOTEXNIKA — bo'lim bo'yicha
  const bySection: Record<string, ModuleDef[]> = group.ageGroup === "SENIOR"
    ? { DESIGN: ROBO_SENIOR_DESIGN, PROGRAMMING: ROBO_SENIOR_PROG, ROBOTICS: ROBO_SENIOR_ROBOTICS }
    : { DESIGN: ROBO_MIDDLE_DESIGN, PROGRAMMING: ROBO_MIDDLE_PROG, ROBOTICS: ROBO_MIDDLE_ROBOTICS };
  return bySection[group.section ?? ""] ?? [];
}

// ---- Sarlavhani tahlil qilish ------------------------------------------------

// "(d-35)", "(D 16)", "(p-3)" ko'rinishidagi aniq reja-raqam belgisi
const EXPLICIT_RE = /\(\s*[a-zа-я]\s*[-–—]?\s*(\d{1,3})\s*\)/i;

// Boshidagi eski tartib prefiksi: "32-dars.", "5.", "12)" — olib tashlanadi,
// chunki u eski dasturdagi raqam bo'lishi mumkin (ichki raqam emas).
const LEAD_PREFIX_RE = /^\s*\d+\s*[-.)]?\s*(dars\s*[.:]?)?\s*/i;

// Prefiks olib tashlangandan keyingi ichki raqam: "1-qism", "3-dars", "2-часть",
// yoki oxiridagi yalang'och raqam ("Spline 2")
const SUB_NUM_RES = [
  /(\d{1,3})\s*[-–—]?\s*(?:qism|qsim|часть|part|dars)/i,
  /(?:^|\s)(\d{1,3})\s*$/,
];

export interface SortKey {
  pos: number; // asosiy pozitsiya (aniq belgi yoki modul starti)
  sub: number; // modul ichidagi raqam
  matched: boolean; // biror signal topildimi
}

export function computeSortKey(rawTitle: string, group: OrderGroup): SortKey {
  const title = String(rawTitle ?? "").trim();
  const lower = ` ${title.toLowerCase()} `;

  // 1) Aniq belgi — eng kuchli signal
  const explicit = title.match(EXPLICIT_RE);
  if (explicit) return { pos: Number(explicit[1]), sub: 0, matched: true };

  // 2) Modul kalit so'zi
  const modules = modulesFor(group);
  let mod: ModuleDef | null = null;
  for (const m of modules) {
    if (m.keywords.some((k) => lower.includes(k))) { mod = m; break; }
  }
  if (!mod) return { pos: Number.MAX_SAFE_INTEGER, sub: 0, matched: false };

  // Ichki raqam — eski prefiksni olib tashlab qidiramiz
  const rest = title.replace(LEAD_PREFIX_RE, "");
  let sub = 0;
  for (const re of SUB_NUM_RES) {
    const m = rest.match(re);
    if (m) { sub = Number(m[1]); break; }
  }
  return { pos: mod.start, sub, matched: true };
}

// Darslar ro'yxatini kanonik tartibда saralaydi (stabil: teng kalitlarda
// mavjud `order` saqlanadi). Signal topilmaganlar oxiriga tushadi.
export function sortLessons<T extends { title: string; order: number }>(
  lessons: T[],
  group: OrderGroup,
): T[] {
  return lessons
    .map((l, i) => ({ l, key: computeSortKey(l.title, group), i }))
    .sort((a, b) =>
      a.key.pos - b.key.pos ||
      a.key.sub - b.key.sub ||
      a.l.order - b.l.order ||
      a.i - b.i,
    )
    .map((x) => x.l);
}
