import { nameKey } from "../lib/nameKey.js";

// Ustozlar statistikasi — Google Sheet'dan (CSV export) jonli olinadi va keshlanadi.
// Manba jadval ikki qatorli sarlavhaga ega; ma'lumot 3-qatordan boshlanadi.
const SHEET_ID = "1asJpws1tN-3YJNl15IQEeBTl8iIEePXjNy5Ri769fis";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;
// Ma'lumot har kuni 21:00 (Asia/Tashkent) da scheduler orqali yangilanadi.
// TTL — zaxira: agar scheduler o'tkazib yuborsa, 25 soatdan keyin so'rovda qayta olinadi.
const TTL_MS = 25 * 60 * 60 * 1000;
const REFRESH_HOUR = 21; // kechki 21:00 (server vaqti = Asia/Tashkent, +05)

export interface TeacherStat {
  name: string;
  nameKey: string;
  branch: string | null;
  davomat: number | null; // o'quvchilar davomati, %
  uyBajarilishi: number | null; // uy vazifa bajarilishi, % (100 - topshirmagan)
  uyTekshirilmaganSoni: number | null; // tekshirilmagan uy vazifa SONI (foiz emas)
  kechikish: number | null; // o'qituvchi kechikishi, daqiqa
  guruhlar: number | null; // guruhlar soni
  umumiyBall: number | null; // umumiy ball
}

let cache: { data: TeacherStat[]; ts: number } | null = null;

// "96,95%" / "97%" / "5" / "" -> number | null
// (CSV qo'lda parse qilinadi, shuning uchun qiymatlar har doim matn ko'rinishida keladi —
//  XLSX foizni 0.97 ga aylantirib yuborardi, shuning uchun XLSX ishlatilmaydi.)
function num(v: unknown): number | null {
  const t = String(v ?? "").trim().replace("%", "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Oddiy CSV parser (qo'shtirnoq ichidagi vergul/yangi qatorni hisobga oladi)
function parseCSV(s: string): string[][] {
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

export async function getAllStats(force = false): Promise<TeacherStat[]> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache.data;

  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Statistika yuklab bo'lmadi (${res.status})`);
  const text = await res.text();

  const rows = parseCSV(text);

  // Ustun indekslari — asosiy (ishonchli to'ldirilgan) strukturalangan jadvaldan:
  // 0=HH ID, 2=O'qituvchi, 3=Filial,
  // 7=Uy vazifa Tekshirilmagan SONI, 10=Uy vazifa Bajarmagan(%),
  // 12=Kechikish(daqiqa), 14=O'quvchilar davomati(%),
  // 17=Umumiy ball, 20=Guruhlar soni
  const data: TeacherStat[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = (rows[i] ?? []) as unknown[];
    const name = String(r[2] ?? "").trim();
    const id = String(r[0] ?? "").trim();
    if (!name || !/^\d+$/.test(id)) continue; // faqat haqiqiy ustoz qatorlari

    const bajarmagan = num(r[10]); // bajarmaganlar foizi
    data.push({
      name,
      nameKey: nameKey(name),
      branch: String(r[3] ?? "").trim() || null,
      davomat: num(r[14]),
      uyBajarilishi: bajarmagan == null ? null : Math.max(0, Math.round((100 - bajarmagan) * 10) / 10),
      uyTekshirilmaganSoni: num(r[7]),
      kechikish: num(r[12]),
      guruhlar: num(r[20]),
      umumiyBall: num(r[17]),
    });
  }

  cache = { data, ts: Date.now() };
  return data;
}

// Ismlarni moslashtirish (tartibga bog'liq emas + qisqa/to'liq shaklga to'lerant):
// "Ikrom Bekmurodov" ~ "Bekmurodov Ikromjon" (ikrom -> ikromjon prefiks).
function nameMatch(a: string, b: string): boolean {
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

export async function getStatByName(name: string): Promise<TeacherStat | null> {
  const key = nameKey(name);
  if (!key) return null;
  const all = await getAllStats();
  // 1) aniq moslik
  const exact = all.find((s) => s.nameKey === key);
  if (exact) return exact;
  // 2) fuzzy moslik (ism tartibi / qisqa-to'liq shakl farqlari)
  return all.find((s) => nameMatch(s.name, name)) ?? null;
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
