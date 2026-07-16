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
  // Kanonik modul nomi — AI tasnifi shu nomlardan birini qaytaradi
  name: string;
  // Kichik harfda qidiriladigan kalit so'zlar (typo variantlari bilan)
  keywords: string[];
  // Kanonik boshlang'ich pozitsiya (darsma-dars reja ma'lum bo'lsa — haqiqiy
  // dars raqami; aks holda modul tartib nomeri × 100)
  start: number;
}

// ---- Modul ketma-ketliklari (o'quv reja jadvallaridan) ----------------------

// ROBOTEXNIKA · MIDDLE (9–11) · DESIGN — ERP darsma-dars ro'yxati (1–38)
const ROBO_MIDDLE_DESIGN: ModuleDef[] = [
  { name: "Kompyuter savodxonligi", keywords: ["kompyuter", "komputer", "keyboard", "mouse", "qurilma", "qurulma"], start: 1 },
  { name: "Google vositalari", keywords: ["google docs", "google sheets", "google"], start: 2 },
  { name: "AI vositalari", keywords: ["ai ", "teachable", "gemini", "prompt", "notebooklm", "video gener", "video yasash", "app builder", "mini app", "tasvir"], start: 5 },
  { name: "Tinkercad", keywords: ["tinkercad", "tinkercard"], start: 11 },
  { name: "Canva", keywords: ["canva"], start: 17 },
  { name: "Yakuniy nazorat", keywords: ["yakuniy nazorat", "foundation"], start: 19 },
  { name: "Figma", keywords: ["figma", "figam"], start: 20 },
  { name: "Figjam", keywords: ["figjam"], start: 27 },
  { name: "Spline", keywords: ["spline"], start: 29 },
  { name: "Onshape", keywords: ["onshape", "onahape", "onshap"], start: 34 },
];

// ROBOTEXNIKA · MIDDLE · PROGRAMMING — oylik reja: Scratch → Python → AppInventor → Web
const ROBO_MIDDLE_PROG: ModuleDef[] = [
  { name: "Scratch", keywords: ["scratch"], start: 100 },
  { name: "Python", keywords: ["python", "turtle"], start: 200 },
  { name: "App Inventor", keywords: ["app inventor", "appinventor", "appinvntor"], start: 300 },
  { name: "Web (HTML/CSS)", keywords: ["html", "css", "web", "sayt"], start: 400 },
];

// ROBOTEXNIKA · MIDDLE · ROBOTICS — WeDo → Spike → Elektronika → Arduino → Musobaqa → IoT
const ROBO_MIDDLE_ROBOTICS: ModuleDef[] = [
  { name: "WeDo", keywords: ["wedo", "we do"], start: 100 },
  { name: "Spike", keywords: ["spike"], start: 200 },
  { name: "Elektronika", keywords: ["elektronika", "elektrinika", "eelktronika", "electronika"], start: 300 },
  { name: "Arduino", keywords: ["arduino", "arduoino", "arduno"], start: 400 },
  { name: "Musobaqa robototexnikasi", keywords: ["musobaqa", "robo-futbol", "labirint", "sumo"], start: 500 },
  { name: "IoT (ESP32)", keywords: ["esp32", "iot", "mqtt", "blynk"], start: 600 },
];

// ROBOTEXNIKA · SENIOR (12–15) · DESIGN — amaldagi kurs Middle Design bilan
// bir xil foundation ketma-ketligini o'z ichiga oladi (import qilingan darslar
// (d-N) belgilari bilan keladi), oxirida Onshape chuqurlashadi:
// Kompyuter → Google → AI → Tinkercad → Canva → Yakuniy → Figma → Figjam → Spline → Onshape
const ROBO_SENIOR_DESIGN: ModuleDef[] = [
  { name: "Kompyuter savodxonligi", keywords: ["kompyuter", "komputer", "keyboard", "mouse", "qurilma", "qurulma"], start: 1 },
  { name: "Google vositalari", keywords: ["google docs", "google sheets", "google"], start: 2 },
  { name: "AI vositalari", keywords: ["ai ", "teachable", "gemini", "prompt", "notebooklm", "video gener", "video yasash", "videolar", "app builder", "mini app", "tasvir"], start: 5 },
  { name: "Tinkercad", keywords: ["tinkercad", "tinkercard"], start: 11 },
  { name: "Canva", keywords: ["canva"], start: 17 },
  { name: "Yakuniy nazorat", keywords: ["yakuniy nazorat", "foundation"], start: 19 },
  { name: "Figma", keywords: ["figma", "figam"], start: 20 },
  { name: "Figjam", keywords: ["figjam"], start: 27 },
  { name: "Spline", keywords: ["spline"], start: 29 },
  { name: "Onshape", keywords: ["onshape", "onahape", "onshap", "3d print", "slicer", "3d cad", "sketch"], start: 34 },
];
// Programming: Scratch (1-2-oy) → Python (3-6-oy) → App Inventor (7-9-oy)
const ROBO_SENIOR_PROG: ModuleDef[] = [
  { name: "Scratch", keywords: ["scratch"], start: 100 },
  { name: "Python", keywords: ["python", "turtle"], start: 200 },
  { name: "App Inventor", keywords: ["app inventor", "appinventor", "appinvntor"], start: 300 },
];
// Robotics: Spike (1-4-oy) → Elektronika (5-6) → Arduino (6-10, musobaqalar bilan) → IoT/Blynk (10-12)
const ROBO_SENIOR_ROBOTICS: ModuleDef[] = [
  { name: "Spike", keywords: ["spike"], start: 100 },
  { name: "Elektronika", keywords: ["elektronika", "elektrinika", "eelktronika", "electronika"], start: 200 },
  { name: "Arduino", keywords: ["arduino", "arduoino", "arduno"], start: 300 },
  { name: "Musobaqa robototexnikasi", keywords: ["musobaqa", "robo-futbol", "labirint", "sumo"], start: 400 },
  { name: "IoT (ESP32/Blynk)", keywords: ["esp32", "iot", "mqtt", "blynk", "ble"], start: 500 },
];

// DASTURLASH · MIDDLE (9–11) — 24 oylik reja (1-yil: Scratch→JS, 2-yil: Python→Final)
const DAST_MIDDLE: ModuleDef[] = [
  { name: "Scratch", keywords: ["scratch"], start: 100 },
  { name: "Figma", keywords: ["figma", "figam"], start: 200 },
  { name: "Framer", keywords: ["framer"], start: 300 },
  { name: "GitHub", keywords: ["github"], start: 400 },
  { name: "HTML", keywords: ["html"], start: 500 },
  { name: "CSS", keywords: ["css", "flexbox", "layout"], start: 600 },
  { name: "Responsive dizayn", keywords: ["responsive"], start: 700 },
  { name: "JavaScript", keywords: ["javascript", "java script", " js "], start: 800 },
  { name: "Python", keywords: ["python", "turtle"], start: 900 },
  { name: "Telegram bot (no-code)", keywords: ["telegram", "bot "], start: 1000 },
  { name: "Database (SQLite)", keywords: ["sqlite", "database", "baza"], start: 1100 },
  { name: "API", keywords: ["api", "webhook"], start: 1200 },
  { name: "Telegram bot (aiogram)", keywords: ["aiogram"], start: 1300 },
  { name: "Algoritmlash", keywords: ["algoritm", "puzzle"], start: 1400 },
  { name: "Final loyiha", keywords: ["final", "yakuniy loyiha"], start: 1500 },
];

// DASTURLASH · SENIOR (12–15) — 18 oylik reja (Sheets "12-15 Dasturlash"):
// Scratch → Figma/Framer → HTML/CSS+GitHub → CSS Advanced → JS → JS DOM →
// No-code bot + Python Intro → Python (Basic→OOP) → SQLite → API/JSON → aiogram → Algoritm → Final
const DAST_SENIOR: ModuleDef[] = [
  { name: "Scratch", keywords: ["scratch"], start: 100 },
  { name: "Figma/Framer", keywords: ["figma", "figam", "framer"], start: 200 },
  { name: "GitHub", keywords: ["github"], start: 300 },
  { name: "HTML", keywords: ["html"], start: 400 },
  { name: "CSS", keywords: ["css", "flexbox", "grid", "responsive"], start: 500 },
  { name: "JavaScript", keywords: ["javascript", "java script", " js ", "dom"], start: 600 },
  { name: "Telegram bot (no-code)", keywords: ["telegram", "botfather", "no-code", "nocode"], start: 700 },
  { name: "Python", keywords: ["python", "turtle", "oop"], start: 800 },
  { name: "Database (SQLite)", keywords: ["sqlite", "database", "baza"], start: 900 },
  { name: "API va JSON", keywords: ["api", "json"], start: 1000 },
  { name: "Telegram bot (aiogram)", keywords: ["aiogram"], start: 1100 },
  { name: "Algoritmlash", keywords: ["algoritm", "big o", "leetcode"], start: 1200 },
  { name: "Final loyiha", keywords: ["final", "yakuniy loyiha"], start: 1300 },
];

// Guruh → modul ro'yxati. Yil kesib o'tilmaydi: tartib faqat guruh ichida
// solishtiriladi, shuning uchun bir yo'nalishning barcha yillari uchun bitta
// umumiy ketma-ketlik yetarli.
export function modulesFor(group: OrderGroup): ModuleDef[] {
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

// Boshidagi KANONIK raqam: "43. Mavzu" yoki "43) Mavzu" — "dars" SO'ZISIZ.
// Yangi darsma-dars o'quv rejadan olingan ro'yxatlar shu ko'rinishda keladi va
// raqam aniq o'rin hisoblanadi. Eski "32-dars. ..." ko'rinishi bunga KIRMAYDI
// (u eski dasturdagi raqam bo'lishi mumkin — modul bo'yicha tartiblanadi).
const CANONICAL_LEAD_RE = /^\s*(\d{1,3})[.)]\s+/;

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
  explicit: boolean; // aniq raqam belgisi topildimi ("(d-35)" yoki "43. ")
}

export function computeSortKey(rawTitle: string, group: OrderGroup): SortKey {
  const title = String(rawTitle ?? "").trim();
  const lower = ` ${title.toLowerCase()} `;

  // 1) Aniq belgi — eng kuchli signal
  const explicit = title.match(EXPLICIT_RE);
  if (explicit) return { pos: Number(explicit[1]), sub: 0, matched: true, explicit: true };

  // 2) Kanonik bosh raqam ("43. Mavzu") — "dars" so'zisiz
  const lead = title.match(CANONICAL_LEAD_RE);
  if (lead && !/^\s*\d{1,3}[.)]?\s*[-–—]?\s*dars/i.test(title)) {
    return { pos: Number(lead[1]), sub: 0, matched: true, explicit: true };
  }

  // 3) Modul kalit so'zi
  const modules = modulesFor(group);
  let mod: ModuleDef | null = null;
  for (const m of modules) {
    if (m.keywords.some((k) => lower.includes(k))) { mod = m; break; }
  }
  if (!mod) return { pos: Number.MAX_SAFE_INTEGER, sub: 0, matched: false, explicit: false };

  // Ichki raqam — eski prefiksni olib tashlab qidiramiz
  const rest = title.replace(LEAD_PREFIX_RE, "");
  let sub = 0;
  for (const re of SUB_NUM_RES) {
    const m = rest.match(re);
    if (m) { sub = Number(m[1]); break; }
  }
  return { pos: mod.start, sub, matched: true, explicit: false };
}

// Dars sarlavhasi va biriktirilgan quiz sarlavhasidan yaxshiroq kalitni
// tanlaydi: aniq raqam (explicit) har doim ustun — qaysi sarlavhada bo'lsa ham.
// (from-folder darsni tozalangan nom bilan yaratadi — kanonik raqam quiz
// nomida qolgan bo'lishi mumkin.)
export function bestKey(lessonTitle: string, quizTitle: string | undefined, group: OrderGroup): SortKey {
  const kl = computeSortKey(lessonTitle, group);
  if (kl.explicit) return kl;
  const kq = quizTitle ? computeSortKey(quizTitle, group) : null;
  if (kq?.explicit) return kq;
  if (kl.matched) return kl;
  if (kq?.matched) return kq;
  return kl;
}

// AI aniqlagan modul nomini kanonik ro'yxatga solishtirish uchun normalizatsiya
function normModule(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "");
}

// AI tahlilidan (aiModule + aiSeq) tartib kaliti. Modul nomi kanonik ro'yxatda
// topilmasa null — chaqiruvchi kalit so'z usuliga qaytadi.
export function aiKey(
  aiModule: string | null | undefined,
  aiSeq: number | null | undefined,
  group: OrderGroup,
): SortKey | null {
  if (!aiModule) return null;
  const target = normModule(aiModule);
  const mod = modulesFor(group).find((m) => normModule(m.name) === target);
  if (!mod) return null;
  return { pos: mod.start, sub: aiSeq ?? 0, matched: true, explicit: false };
}

// To'liq kalit: sarlavhadagi ANIQ raqam ("(d-35)", "43. ") > AI tahlili >
// kalit so'z. AI slaydlarning o'zini o'qigan — sarlavha taxminidan ishonchliroq.
export function bestKeyAI(
  lessonTitle: string,
  quizTitle: string | undefined,
  aiModule: string | null | undefined,
  aiSeq: number | null | undefined,
  group: OrderGroup,
): SortKey {
  const kl = computeSortKey(lessonTitle, group);
  if (kl.explicit) return kl;
  const kq = quizTitle ? computeSortKey(quizTitle, group) : null;
  if (kq?.explicit) return kq;
  const ka = aiKey(aiModule, aiSeq, group);
  if (ka) return ka;
  if (kl.matched) return kl;
  if (kq?.matched) return kq;
  return kl;
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
