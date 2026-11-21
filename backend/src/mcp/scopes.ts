import { prisma } from "../prisma.js";

// OAuth scope'lari (MCP orqali beriladigan ruxsatlar)
export const SCOPES = ["quiz:read", "quiz:write", "slide:delete"] as const;
export type Scope = (typeof SCOPES)[number];

// Ruxsat sahifasi va "Ulangan ilovalar" uchun o'zbekcha nomlar
export const SCOPE_LABELS: Record<Scope, string> = {
  "quiz:read": "Quizlar va slaydlarni ko'rish",
  "quiz:write": "Quiz va slayd yaratish, slaydlarni tahrirlash",
  "slide:delete": "Slayd o'chirish",
};

export function parseScopes(s: string | string[] | undefined | null): Scope[] {
  const list = Array.isArray(s) ? s : String(s ?? "").split(/\s+/);
  return SCOPES.filter((x) => list.includes(x));
}

export interface ScopeSubject {
  isAdmin: boolean;
  approved: boolean;
  canCreate: boolean;
}

/**
 * Foydalanuvchi HOZIR qaysi scope'larni ola oladi:
 *  - ustoz (approved) yoki admin bo'lmasa — hech qaysi (MCP faqat markaz ustozlari uchun);
 *  - quiz:read — barcha ustozlarga;
 *  - quiz:write / slide:delete — faqat admin yoki "slayd qilish" (canCreate) ruxsati borlarga.
 * Har tool chaqiruvida qayta hisoblanadi — admin canCreate'ni olsa, darhol ta'sir qiladi.
 */
export function allowedScopes(t: ScopeSubject | null | undefined): Scope[] {
  if (!t || !(t.isAdmin || t.approved)) return [];
  const write = t.isAdmin || t.canCreate;
  return write ? [...SCOPES] : ["quiz:read"];
}

/** Berilgan (grant) va hozir ruxsat etilgan scope'lar kesishmasi. */
export function effectiveScopes(granted: Scope[], t: ScopeSubject | null | undefined): Scope[] {
  const allowed = allowedScopes(t);
  return granted.filter((s) => allowed.includes(s));
}

export async function loadScopeSubject(teacherId: string): Promise<ScopeSubject | null> {
  return prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { isAdmin: true, approved: true, canCreate: true },
  });
}
