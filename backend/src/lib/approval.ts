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

export function isAdminEmail(email: string): boolean {
  return config.adminEmails.map((e) => e.toLowerCase()).includes(email.toLowerCase());
}

// Avtomatik (override'siz) approved: admin email yoki roster'da bor
async function autoApproved(email: string, name: string): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  return isApprovedByName(name);
}

// Bitta ustoz uchun yakuniy approved hisoblash.
// override (admin qo'lda bergan/olgan) avtomatik hisobdan ustun turadi.
export async function computeApproved(
  email: string,
  name: string,
  override?: boolean | null,
): Promise<boolean> {
  if (override === true) return true;
  if (override === false) return false;
  return autoApproved(email, name);
}

// Roster o'zgargach — barcha ustozlarning approved holatini qayta hisoblaymiz.
// accessOverride qo'yilganlar (null emas) o'zgartirilmaydi.
export async function resyncAllApproved(): Promise<void> {
  const teachers = await prisma.teacher.findMany({
    select: { id: true, email: true, name: true, approved: true, accessOverride: true },
  });
  const roster = await prisma.rosterTeacher.findMany({ select: { nameKey: true } });
  const keys = new Set(roster.map((r) => r.nameKey));
  for (const t of teachers) {
    const approved =
      t.accessOverride != null
        ? t.accessOverride
        : isAdminEmail(t.email) || keys.has(nameKey(t.name));
    if (approved !== t.approved) {
      await prisma.teacher.update({ where: { id: t.id }, data: { approved } });
    }
  }
}
