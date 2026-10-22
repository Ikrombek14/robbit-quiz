import { config } from "../config.js";
import { nameKey } from "../lib/nameKey.js";
import { resolveByName } from "./stats.js";

// Ustozning JONLI tekshirilmagan uy vazifalari soni — ERP bazasidan, hisobot dashboard'ning
// ichki API'si orqali (/api/internal/hw-unchecked). Quiz serveri ERP'ga bevosita ulanmaydi:
// readonly rolning ulanish limiti 2 va ikkalasi dashboard pool'ida (uchinchisi uni yiqitadi).
// Ta'rif (dashboard'da): faol o'quvchilarning 48 soatdan ko'p tekshirilmay turgan ishlari.
// Avval bu son kuniga bir marta yangilanadigan Google Sheet'dan olinardi va eskirib qolardi
// (ustoz tekshirib bo'lsa ham kechgacha bloklangan qolardi).

export const HW_OLDER_THAN_HOURS = 48;

interface ErpHwTeacher { hhId: number; name: string; nameKey: string; count: number }

let cache: { at: number; list: ErpHwTeacher[] } | null = null;
let inflight: Promise<ErpHwTeacher[]> | null = null;
const TTL_MS = 3 * 60 * 1000; // odatiy kirishlar — 3 daqiqalik kesh
const FRESH_MIN_MS = 15 * 1000; // "Qayta tekshirish" — 15 soniyadan tez-tez dashboard'ga urmaymiz

export function erpHwConfigured(): boolean {
  return Boolean(config.dashboardToken);
}

async function load(): Promise<ErpHwTeacher[]> {
  const r = await fetch(`${config.dashboardUrl}/api/internal/hw-unchecked`, {
    headers: { "X-Internal-Token": config.dashboardToken },
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`dashboard javobi ${r.status}`);
  const j = (await r.json()) as { teachers?: { hhId: number; name: string; count: number }[] };
  if (!Array.isArray(j.teachers)) throw new Error("dashboard javobi formati noto'g'ri");
  return j.teachers.map((t) => ({ hhId: t.hhId, name: t.name, nameKey: nameKey(t.name), count: t.count }));
}

// Ustoz ismi bo'yicha son. null — ERP'dagi faol ustozlar orasida topilmadi.
// fresh=true — "Qayta tekshirish": keshni chetlab o'tadi (lekin 15 soniyadan tez emas).
// Dashboard javob bermasa: eski kesh bo'lsa o'shani ishlatamiz, bo'lmasa xato (chaqiruvchi
// hisobni oshirmaydi — texnik nosozlik uchun ustoz jazolanmasin).
export async function getErpHwCount(name: string, fresh = false): Promise<number | null> {
  const age = cache ? Date.now() - cache.at : Infinity;
  if (age > TTL_MS || (fresh && age > FRESH_MIN_MS)) {
    inflight ??= load()
      .then((list) => { cache = { at: Date.now(), list }; return list; })
      .finally(() => { inflight = null; });
    try {
      await inflight;
    } catch (e) {
      console.warn(`[hw] dashboard'dan son olinmadi: ${e instanceof Error ? e.message : e}${cache ? " — eski kesh ishlatildi" : ""}`);
      if (!cache) throw e;
    }
  }
  const t = resolveByName(cache!.list, name);
  return t ? t.count : null;
}
