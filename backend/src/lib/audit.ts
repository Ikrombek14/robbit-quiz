import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import type { AuthedRequest } from "../auth.js";

// ---- Audit log ----
// Har bir o'zgartiruvchi API so'rovi (POST/PUT/PATCH/DELETE) javob qaytgandan keyin
// AuditLog jadvaliga yoziladi: kim, qachon, qaysi yo'l, natija (status).
// Route o'zi auditNote() bilan aniqroq ma'lumot (amal nomi, tavsif, oldin→keyin)
// qo'shishi mumkin — yozuv baribir BITTA bo'ladi.
// Audit yozish xatosi hech qachon asosiy so'rovni buzmaydi (fire-and-forget).

export interface AuditNote {
  action?: string;
  entity?: string;
  entityId?: string;
  summary?: string;
  details?: unknown;
  actorId?: string; // login/ro'yxatdan o'tishda — token hali so'rovda yo'q, route o'zi beradi
}

const NOTE_KEY = "auditNote";

/** Route ichidan joriy so'rov audit yozuviga tafsilot qo'shish. */
export function auditNote(res: Response, note: AuditNote): void {
  const prev = (res.locals[NOTE_KEY] as AuditNote | undefined) ?? {};
  res.locals[NOTE_KEY] = { ...prev, ...note };
}

// Yozilmaydigan yo'llar: o'quvchilarning ochiq so'rovlari va texnik endpointlar.
// (Login/ro'yxatdan o'tish YOZILADI — lekin parol/credential hech qachon saqlanmaydi.)
const SKIP_PREFIXES = ["/api/public", "/api/health"];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Ma'lum yo'llar uchun o'qiladigan amal nomi (route auditNote bermasa)
function defaultAction(method: string, path: string): string {
  if (path === "/api/auth/login") return "auth.login";
  if (path === "/api/auth/register") return "auth.register";
  if (path === "/api/auth/google") return "auth.google";
  return `${method} ${path.replace(/\/[a-z0-9]{20,}(?=\/|$)/gi, "/:id")}`;
}

// Yo'ldagi cuid ko'rinishidagi id — entityId sifatida
function idFromPath(path: string): string | undefined {
  const m = path.match(/\/([a-z0-9]{20,})(?=\/|$)/i);
  return m?.[1];
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!MUTATING.has(req.method)) return next();
  const path = req.originalUrl.split("?")[0];
  if (!path.startsWith("/api") || SKIP_PREFIXES.some((p) => path.startsWith(p))) return next();

  res.on("finish", () => {
    void writeAudit(req as AuthedRequest, res, path).catch((e) => {
      console.error("[audit] yozib bo'lmadi:", e instanceof Error ? e.message : e);
    });
  });
  next();
}

async function writeAudit(req: AuthedRequest, res: Response, path: string): Promise<void> {
  const note = (res.locals[NOTE_KEY] as AuditNote | undefined) ?? {};
  let actorId = req.teacherId ?? note.actorId ?? null;
  let actorEmail: string | null = null;
  let actorName: string | null = null;

  if (actorId) {
    const t = await prisma.teacher.findUnique({ where: { id: actorId }, select: { email: true, name: true } });
    actorEmail = t?.email ?? null;
    actorName = t?.name ?? null;
  } else if (path === "/api/auth/login" || path === "/api/auth/register") {
    // Muvaffaqiyatsiz login urinishi — faqat kiritilgan email (parol HECH QACHON yozilmaydi)
    actorEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase().slice(0, 200) : null;
  }

  await prisma.auditLog.create({
    data: {
      actorId,
      actorEmail,
      actorName,
      action: note.action ?? defaultAction(req.method, path),
      method: req.method,
      path: path.slice(0, 500),
      status: res.statusCode,
      entity: note.entity ?? null,
      entityId: note.entityId ?? idFromPath(path) ?? null,
      summary: note.summary?.slice(0, 1000) ?? null,
      details: note.details === undefined ? Prisma.JsonNull : (note.details as Prisma.InputJsonValue),
      ip: req.ip ?? null,
    },
  });
}

/**
 * HTTP so'rov middleware'idan tashqaridagi hodisa uchun audit yozuvi (masalan /oauth/*,
 * MCP — ular /api ostida emas). Fire-and-forget: xato asosiy ishni buzmaydi.
 * Token/maxfiy qiymatlarni `details`ga YOZMANG.
 */
export function writeAuditEvent(ev: {
  actorId?: string | null;
  action: string;
  method?: string;
  path: string;
  status?: number;
  entity?: string;
  entityId?: string;
  summary?: string;
  details?: unknown;
  ip?: string | null;
}): void {
  void (async () => {
    let actorEmail: string | null = null;
    let actorName: string | null = null;
    if (ev.actorId) {
      const t = await prisma.teacher.findUnique({ where: { id: ev.actorId }, select: { email: true, name: true } });
      actorEmail = t?.email ?? null;
      actorName = t?.name ?? null;
    }
    await prisma.auditLog.create({
      data: {
        actorId: ev.actorId ?? null,
        actorEmail,
        actorName,
        action: ev.action,
        method: ev.method ?? "POST",
        path: ev.path.slice(0, 500),
        status: ev.status ?? 200,
        entity: ev.entity ?? null,
        entityId: ev.entityId ?? null,
        summary: ev.summary?.slice(0, 1000) ?? null,
        details: ev.details === undefined ? Prisma.JsonNull : (ev.details as Prisma.InputJsonValue),
        ip: ev.ip ?? null,
      },
    });
  })().catch((e) => {
    console.error("[audit] yozib bo'lmadi:", e instanceof Error ? e.message : e);
  });
}

/** Ikki obyekt orasidagi farq: faqat o'zgargan maydonlar { field: [oldin, keyin] }. */
export function diffFields<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: T | null | undefined,
  fields: (keyof T)[],
): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const f of fields) {
    const a = before?.[f] ?? null;
    const b = after?.[f] ?? null;
    if (a !== b) out[String(f)] = [a, b];
  }
  return out;
}
