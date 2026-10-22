import { nameKey, looseNameKey } from "../lib/nameKey.js";

// Ustozlar statistikasi — Google Sheet'dan (CSV export) jonli olinadi va keshlanadi.
// Manba jadval ikki qatorli sarlavhaga ega; ma'lumot 3-qatordan boshlanadi.
const SHEET_ID = "1asJpws1tN-3YJNl15IQEeBTl8iIEePXjNy5Ri769fis";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
// Sheet kun davomida tahrirlanadi — kesh qisqa (10 daqiqa): sayt deyarli jonli
// ko'rsatadi, Sheet'ga yuk esa baribir minimal (10 daqiqada ko'pi bilan 1 so'rov).
const TTL_MS = 10 * 60 * 1000;
const REFRESH_HOUR = 21; // kechki 21:00 kafolatli yangilash (server vaqti = Asia/Tashkent)

export interface TeacherStat {
  name: string;
  nameKey: string;
  branch: string | null;
  davomat: number | null; // o'quvchilar davomati, %
  uyBajarilishi: number | null; // uy vazifa bajarilishi, % (100 - topshirmagan)
  uyTekshirilmaganSoni: number | null; // tekshirilmagan uy vazifa SONI (foiz emas)
  kechikish: number | null; // o'qituvchi kechikishi, daqiqa (oy varag'idagi Kechikish→Daqiqa ustunidan)
  kechikishOy: string | null; // kechikish qaysi oy varag'idan olingani (masalan "Iyun")
  ketganlar: number | null; // ketgan o'quvchilar soni (Sheet E ustun)
  guruhlar: number | null; // guruhlar soni
  umumiyBall: number | null; // umumiy ball
}

let cache: { data: TeacherStat[]; ts: number } | null = null;

// "96,95%" / "97%" / "5" / "" -> number | null
// (CSV qo'lda parse qilinadi, shuning uchun qiymatlar har doim matn ko'rinishida keladi —
//  XLSX foizni 0.97 ga aylantirib yuborardi, shuning uchun XLSX ishlatilmaydi.)
export function num(v: unknown): number | null {
  const t = String(v ?? "").trim().replace("%", "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Oddiy CSV parser (qo'shtirnoq ichidagi vergul/yangi qatorni hisobga oladi)
export function parseCSV(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// Kesh oxirgi marta qachon yangilangani (frontend "Yangilangan: ..." uchun)
export function statsUpdatedAt(): number | null {
  return cache?.ts ?? null;
}

// Statistika HAR DOIM joriy oy varag'idan olinadi (Toshkent vaqti bo'yicha, masalan "Oktabr").
// Defolt (birinchi) varaq ishlatilmaydi — ofis yangi oy varag'ini ochib, eskisini birinchi
// o'rinda qoldirib ketadi (2026-10: defolt "Sentabr" edi, sayt eski raqamlarni ko'rsatgan).
// Joriy oy varag'i yo'q/bo'sh/ustunlari boshqacha bo'lsa — statistika bo'sh qaytadi va
// sheetStatus orqali adminlarga "Sheet'ni to'g'rilang" ogohlantirishi chiqadi.
const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const gviz = (sheet?: string) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv${sheet ? `&sheet=${encodeURIComponent(sheet)}` : ""}`;

export interface SheetStatus { ok: boolean; month: string; error: string | null }
let sheetStatus: SheetStatus | null = null;
export function getSheetStatus(): SheetStatus | null {
  return sheetStatus;
}

function currentMonth(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
  return MONTHS[now.getMonth()];
}

async function getText(u: string, init?: RequestInit): Promise<Response> {
  // 10s timeout — Google Sheets javob bermay osilib qolsa, so'rov cheksiz kutmasin
  const r = await fetch(u, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`Statistika yuklab bo'lmadi (${r.status})`);
  return r;
}

// Defolt varaqning nomi (export javobidagi Content-Disposition'dan, masalan "... - Oktabr.csv")
async function defaultSheetName(): Promise<string | null> {
  const r = await getText(CSV_URL, { method: "HEAD" });
  const m = /filename\*=UTF-8''([^;]+)/.exec(r.headers.get("content-disposition") ?? "");
  return m ? decodeURIComponent(m[1]).replace(/\.csv$/i, "").split(" - ").pop()?.trim() ?? null : null;
}

// Joriy oy varag'i qatorlari yoki muammo matni. Tarmoq xatosida throw qiladi.
async function fetchMonthSheet(month: string): Promise<{ rows: string[][] } | { error: string }> {
  const [text, defaultText] = await Promise.all([
    getText(gviz(month)).then((r) => r.text()),
    getText(gviz()).then((r) => r.text()),
  ]);
  // gviz mavjud bo'lmagan varaq nomiga xato bermay defolt varaqni qaytaradi — natija
  // defolt bilan bir xil bo'lsa va defolt boshqa oyga tegishli bo'lsa, varaq yo'q
  if (text === defaultText && (await defaultSheetName()) !== month) {
    return { error: `Sheet'da "${month}" varag'i topilmadi` };
  }
  const rows = parseCSV(text).filter((r) => r.some((c) => c && c.trim()));
  const h = (rows[0] ?? []).map((x) => x.toLowerCase());
  if (!h[2]?.includes("qituvchi") || !h[7]?.includes("tekshirilmagan")) {
    return { error: `"${month}" varag'ida ustunlar tartibi boshqacha (C — O'qituvchi, H — Uy vazifa Tekshirilmagan bo'lishi kerak)` };
  }
  const filled = rows.filter((r) => /^\d+$/.test(String(r[0] ?? "").trim()) && String(r[7] ?? "").trim());
  if (filled.length < 5) return { error: `"${month}" varag'i hali to'ldirilmagan` };
  return { rows };
}

export async function getAllStats(force = false): Promise<TeacherStat[]> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache.data;

  const month = currentMonth();
  let sheet: Awaited<ReturnType<typeof fetchMonthSheet>>;
  try {
    sheet = await fetchMonthSheet(month);
  } catch (e) {
    if (cache) return cache.data; // tarmoq/timeout xatosi — eski kesh yangisidan yaxshi
    throw e;
  }
  if ("error" in sheet) {
    sheetStatus = { ok: false, month, error: sheet.error };
    cache = { data: [], ts: Date.now() };
    return [];
  }
  sheetStatus = { ok: true, month, error: null };

  // Ustun indekslari (gviz — sarlavha bitta qator, ma'lumot keyingi qatorlardan):
  // 0=HH ID, 2=O'qituvchi, 3=Filial, 4=Ketganlar SONI,
  // 7=Uy vazifa Tekshirilmagan SONI, 10=Uy vazifa Bajarmagan(%),
  // 12=Kechikish(daqiqa), 14=O'quvchilar davomati(%),
  // 17=Umumiy ball, 20=Guruhlar soni
  const data: TeacherStat[] = [];
  for (const row of sheet.rows) {
    const r = row as unknown[];
    const name = String(r[2] ?? "").trim();
    const id = String(r[0] ?? "").trim();
    if (!name || !/^\d+$/.test(id)) continue; // faqat haqiqiy ustoz qatorlari (sarlavha ham o'tib ketadi)

    const bajarmagan = num(r[10]); // bajarmaganlar foizi
    data.push({
      name,
      nameKey: nameKey(name),
      branch: String(r[3] ?? "").trim() || null,
      davomat: num(r[14]),
      uyBajarilishi: bajarmagan == null ? null : Math.max(0, Math.round((100 - bajarmagan) * 10) / 10),
      uyTekshirilmaganSoni: num(r[7]),
      kechikish: num(r[12]),
      kechikishOy: month,
      ketganlar: num(r[4]),
      guruhlar: num(r[20]),
      umumiyBall: num(r[17]),
    });
  }

  cache = { data, ts: Date.now() };
  return data;
}

// Ismlarni moslashtirish (tartibga bog'liq emas + qisqa/to'liq shaklga to'lerant):
// "Ikrom Bekmurodov" ~ "Bekmurodov Ikromjon" (ikrom -> ikromjon prefiks).
export function nameMatch(a: string, b: string): boolean {
  const ta = nameKey(a).split(" ").filter(Boolean);
  const tb = nameKey(b).split(" ").filter(Boolean);
  if (ta.length < 2 || tb.length < 2) return ta.join(" ") === tb.join(" ");
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Set<number>();
  let matched = 0;
  for (const t of short) {
    for (let i = 0; i < long.length; i++) {
      if (used.has(i)) continue;
      const u = long[i];
      // exact yoki biri ikkinchisining prefiksi (kamida 3 harf) — Ikrom/Ikromjon, Aziz/Azizbek
      if (t === u || (t.length >= 3 && u.startsWith(t)) || (u.length >= 3 && t.startsWith(u))) {
        used.add(i);
        matched++;
        break;
      }
    }
  }
  return matched === short.length; // qisqa ro'yxatdagi barcha tokenlar mos kelishi kerak
}

// Ikki so'z orasidagi tahrir masofasi (Levenshtein) — "Baxromov"~"Baxramov" kabi
// bitta harf farqini aniqlash uchun.
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i, ...Array<number>(n).fill(0)];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Token-ma-token moslik, uzun so'zlarda 1 harf xatosiga yo'l qo'yiladi.
// Token soni bir xil bo'lishi shart — "Ikrom" ni "Ikrom Ali" ga qo'shib yubormaslik uchun.
function fuzzyTokenMatch(a: string, b: string): boolean {
  const ta = looseNameKey(a).split(" ").filter(Boolean);
  const tb = looseNameKey(b).split(" ").filter(Boolean);
  if (ta.length === 0 || ta.length !== tb.length) return false;
  const used = new Set<number>();
  let ok = 0;
  for (const t of ta) {
    for (let i = 0; i < tb.length; i++) {
      if (used.has(i)) continue;
      const u = tb[i];
      const tol = Math.min(t.length, u.length) >= 5 ? 1 : 0; // qisqa so'zlarda aniq moslik
      if (t === u || levenshtein(t, u) <= tol) { used.add(i); ok++; break; }
    }
  }
  return ok === ta.length;
}

// Ism bo'yicha yozuvni topish — statistika ham, tahlil ham shu zanjirdan foydalanadi.
// Tartib: 1) aniq kalit  2) yumshoq kalit (apostrof/x-h)  3) prefiks (Ikrom~Ikromjon)
// 4) bitta harf xatosi. 2–4 bosqichlarda moslik UNIKAL bo'lishi shart — aks holda
// null qaytadi: noto'g'ri ustozning statistikasini ko'rsatgandan ko'ra hech narsa
// ko'rsatmagan yaxshi (admin qo'lda biriktiradi).
export function resolveByName<T extends { name: string; nameKey: string }>(list: T[], name: string): T | null {
  const key = nameKey(name);
  if (!key) return null;
  const exact = list.find((s) => s.nameKey === key);
  if (exact) return exact;
  const lk = looseNameKey(name);
  const loose = list.filter((s) => looseNameKey(s.name) === lk);
  if (loose.length === 1) return loose[0];
  const pref = list.filter((s) => nameMatch(s.name, name));
  if (pref.length === 1) return pref[0];
  const fz = list.filter((s) => fuzzyTokenMatch(s.name, name));
  if (fz.length === 1) return fz[0];
  return null;
}

export async function getStatByName(name: string): Promise<TeacherStat | null> {
  if (!nameKey(name)) return null;
  return resolveByName(await getAllStats(), name);
}

// ---- Rejalashtirilgan yangilash: har kuni 21:00 da Sheet'dan qayta oladi ----
let schedulerStarted = false;

function scheduleNextRefresh() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(REFRESH_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1); // bugungi 21:00 o'tgan bo'lsa — ertaga
  const ms = next.getTime() - now.getTime();
  setTimeout(() => {
    getAllStats(true)
      .then(() => console.log(`[stats] ${REFRESH_HOUR}:00 — statistika yangilandi`))
      .catch((e) => console.error("[stats] rejali yangilash xatosi:", (e as Error).message))
      .finally(scheduleNextRefresh);
  }, ms);
  console.log(`[stats] keyingi yangilash: ${next.toLocaleString("uz-UZ")}`);
}

export function startStatsScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;
  // Server ishga tushganda bir marta yuklab qo'yamiz (birinchi 21:00 ni kutmasdan)
  getAllStats(true).catch((e) => console.error("[stats] dastlabki yuklash xatosi:", (e as Error).message));
  scheduleNextRefresh();
}
