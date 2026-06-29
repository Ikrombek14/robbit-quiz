import * as XLSX from "xlsx";
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
  uyTekshirilishi: number | null; // uy vazifa tekshirilishi, % (100 - tekshirilmagan)
  kechikish: number | null; // o'qituvchi kechikishi, daqiqa
  guruhlar: number | null; // guruhlar soni
  umumiyBall: number | null; // umumiy ball
}

let cache: { data: TeacherStat[]; ts: number } | null = null;

// "96,95%" / "97%" / "5" / "" -> number | null
function num(v: unknown): number | null {
  const t = String(v ?? "").trim().replace("%", "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export async function getAllStats(force = false): Promise<TeacherStat[]> {
  if (!force && cache && Date.now() - cache.ts < TTL_MS) return cache.data;

  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Statistika yuklab bo'lmadi (${res.status})`);
  const text = await res.text();

  const wb = XLSX.read(text, { type: "string", raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });

  // Ustun indekslari (manba jadval tartibiga mos):
  // 0=HH ID, 2=O'qituvchi, 3=Filial, 12=Kechikish(daqiqa), 17=Umumiy ball,
  // 20=Guruhlar soni, 29=Tekshirilmagan(%), 30=Topshirmagan(%), 31=Davomat(%)
  const data: TeacherStat[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = (rows[i] ?? []) as unknown[];
    const name = String(r[2] ?? "").trim();
    const id = String(r[0] ?? "").trim();
    if (!name || !/^\d+$/.test(id)) continue; // faqat haqiqiy ustoz qatorlari

    const topshirmagan = num(r[30]);
    const tekshirilmagan = num(r[29]);
    data.push({
      name,
      nameKey: nameKey(name),
      branch: String(r[3] ?? "").trim() || null,
      davomat: num(r[31]),
      uyBajarilishi: topshirmagan == null ? null : Math.max(0, Math.round((100 - topshirmagan) * 10) / 10),
      uyTekshirilishi: tekshirilmagan == null ? null : Math.max(0, Math.round((100 - tekshirilmagan) * 10) / 10),
      kechikish: num(r[12]),
      guruhlar: num(r[20]),
      umumiyBall: num(r[17]),
    });
  }

  cache = { data, ts: Date.now() };
  return data;
}

export async function getStatByName(name: string): Promise<TeacherStat | null> {
  const key = nameKey(name);
  if (!key) return null;
  const all = await getAllStats();
  return all.find((s) => s.nameKey === key) ?? null;
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
