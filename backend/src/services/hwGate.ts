import type { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma.js";
import { verifyToken } from "../auth.js";
import { getStatByName } from "./stats.js";

// Tekshirilmagan uy vazifa bloki. Sheet'dagi son HW_LIMIT dan KO'P bo'lsa, ustozning
// har kungi birinchi kirishi 1 "ogohlantirish" hisoblanadi:
//   1 → ERP'ga yo'naltiriladi, 2 → qattiq ogohlantirish, 3+ → platforma to'liq yopiladi.
// Son HW_LIMIT va undan kam bo'lsa hisob 0 ga qaytadi (blok o'zi ochiladi).
// Platforma admini (isAdmin) vaqtincha HW_UNLOCK_HOURS soatga ochib qo'yishi mumkin.
export const HW_LIMIT = 50;
export const HW_UNLOCK_HOURS = 12;

export type HwLevel = "ok" | "redirect" | "warn" | "block";

// Bugungi sana Toshkent vaqtida ("YYYY-MM-DD") — kun almashinuvi server TZ'iga bog'liq bo'lmasin
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
}

const levelOf = (strikes: number): HwLevel =>
  strikes <= 0 ? "ok" : strikes === 1 ? "redirect" : strikes === 2 ? "warn" : "block";

// Saytga kirishda chaqiriladi (/api/stats/hw-gate). Kun ichida qayta chaqirilsa hisob oshmaydi.
export async function checkHwGate(teacherId: string): Promise<{ level: HwLevel; count: number | null; strikes: number }> {
  const t = await prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { name: true, statsName: true, isAdmin: true, officeAdmin: true, hwStrikes: true, hwStrikeDay: true, hwUnlockUntil: true },
  });
  if (!t) return { level: "ok", count: null, strikes: 0 };
  // Platforma adminlari va markaz admini (ustoz emas) — bloklanmaydi
  if (t.isAdmin || t.officeAdmin) return { level: "ok", count: null, strikes: 0 };

  let count: number | null = null;
  try {
    count = (await getStatByName(t.statsName?.trim() || t.name))?.uyTekshirilmaganSoni ?? null;
  } catch {
    // Sheet ochilmasa — texnik nosozlik uchun hisobni oshirmaymiz (avvaldan bloklangan bo'lsa blok qoladi)
    return { level: t.hwStrikes >= 3 ? "block" : "ok", count: null, strikes: t.hwStrikes };
  }

  // Sheet'da topilmadi yoki son chegaradan oshmagan — hisob 0 ga qaytadi
  if (count == null || count <= HW_LIMIT) {
    if (t.hwStrikes !== 0 || t.hwStrikeDay) {
      await prisma.teacher.update({ where: { id: teacherId }, data: { hwStrikes: 0, hwStrikeDay: null } });
    }
    return { level: "ok", count, strikes: 0 };
  }

  // Admin vaqtincha ochgan — hisob oshmaydi
  if (t.hwUnlockUntil && t.hwUnlockUntil > new Date()) return { level: "ok", count, strikes: t.hwStrikes };

  let strikes = t.hwStrikes;
  const day = today();
  if (t.hwStrikeDay !== day) {
    strikes += 1;
    await prisma.teacher.update({ where: { id: teacherId }, data: { hwStrikes: strikes, hwStrikeDay: day } });
  }
  return { level: levelOf(strikes), count, strikes };
}

// Bloklangan ustozning API so'rovlarini to'xtatadi (faqat ekranda emas — chetlab o'tib bo'lmasin).
// Holat bazadagi hisobdan olinadi; hisob esa har kirishda checkHwGate orqali yangilanadi.
// Socket (jonli o'yin) ga tegilmaydi — boshlangan dars uzilmaydi.
const OPEN_PREFIXES = ["/auth", "/public", "/stats/hw-gate"];

export async function hwBlockGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (OPEN_PREFIXES.some((p) => req.path.startsWith(p))) return next();
  const header = req.headers.authorization;
  const teacherId = header?.startsWith("Bearer ") ? verifyToken(header.slice(7)) : null;
  if (!teacherId) return next(); // avtorizatsiyani requireAuth o'zi tekshiradi
  try {
    const t = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { isAdmin: true, officeAdmin: true, hwStrikes: true, hwUnlockUntil: true },
    });
    const unlocked = !!t?.hwUnlockUntil && t.hwUnlockUntil > new Date();
    if (t && !t.isAdmin && !t.officeAdmin && t.hwStrikes >= 3 && !unlocked) {
      res.status(403).json({ error: "Platforma yopilgan: tekshirilmagan uy vazifalar juda ko'p", code: "HW_BLOCKED" });
      return;
    }
  } catch {
    /* baza xatosi — blokni qo'llamaymiz, so'rov odatdagidek davom etadi */
  }
  next();
}
