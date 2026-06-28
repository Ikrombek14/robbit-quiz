import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { nameKey } from "./nameKey.js";

// Ism roster'da bormi (nameKey orqali, tartibga bog'liq emas)
export async function isApprovedByName(name: string): Promise<boolean> {
  const key = nameKey(name);
  if (!key) return false;
  const hit = await prisma.rosterTeacher.findUnique({ where: { nameKey: key }, select: { id: true } });
  return !!hit;
}

function isAdminEmail(email: string): boolean {
  return config.adminEmails.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}

// Bitta ustoz uchun approved hisoblash: admin yoki roster'da bor
export async function computeApproved(email: string, name: string): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  return isApprovedByName(name);
}

// Roster o'zgargach — barcha ustozlarning approved holatini qayta hisoblaymiz
export async function resyncAllApproved(): Promise<void> {
  const teachers = await prisma.teacher.findMany({ select: { id: true, email: true, name: true, approved: true } });
  const roster = await prisma.rosterTeacher.findMany({ select: { nameKey: true } });
  const keys = new Set(roster.map((r) => r.nameKey));
  for (const t of teachers) {
    const approved = isAdminEmail(t.email) || keys.has(nameKey(t.name));
    if (approved !== t.approved) {
      await prisma.teacher.update({ where: { id: t.id }, data: { approved } });
    }
  }
}
