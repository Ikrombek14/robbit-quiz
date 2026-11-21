import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Mavjud quizni o'zgartirishning YAGONA yo'li ----
// Muharrir (PUT), MCP amallari va versiyalar tarixidan tiklash shu yerdan o'tadi. Bitta
// tranzaksiyada: 1) versiya tekshiriladi va +1 qilinadi (quiz qatori qulflanadi — parallel
// yozuvlar navbatga turadi), 2) o'zgarishdan OLDINGI holat tarixga yoziladi, 3) o'zgarish.

export const MAX_REVISIONS = 20;

export type RevisionSource = "editor" | "mcp" | "restore";

export class VersionConflictError extends Error {
  constructor(public currentVersion: number) {
    super("VERSION_CONFLICT");
  }
}
export class QuizNotFoundError extends Error {}

export interface WriteActor {
  id: string;
  name?: string | null;
}

export interface QuizSnapshot {
  title: string;
  description: string | null;
  shuffle: boolean;
  slides: { kind: string; type: string | null; data: any; notes: string | null; timeLimit: number; points: number }[];
}

function parseData(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

export async function snapshotOf(tx: Prisma.TransactionClient, quizId: string): Promise<QuizSnapshot> {
  const q = await tx.quiz.findUnique({ where: { id: quizId }, include: { slides: { orderBy: { order: "asc" } } } });
  if (!q) throw new QuizNotFoundError();
  return {
    title: q.title,
    description: q.description,
    shuffle: q.shuffle,
    slides: q.slides.map((s) => ({ kind: s.kind, type: s.type, data: parseData(s.data), notes: s.notes, timeLimit: s.timeLimit, points: s.points })),
  };
}

/**
 * Quizni o'zgartiradi. expectedVersion berilsa va bazadagi bilan mos kelmasa —
 * VersionConflictError (hech narsa o'zgarmaydi). Qaytaradi: fn natijasi va yangi versiya.
 */
export async function writeQuiz<T>(
  quizId: string,
  opts: { expectedVersion?: number; source: RevisionSource; actor: WriteActor; summary: string },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<{ result: T; version: number }> {
  return prisma.$transaction(async (tx) => {
    // 1) Versiya: atomar solishtirish+oshirish. Qator qulflanadi — boshqa yozuv shu yerda kutadi.
    const where = opts.expectedVersion === undefined ? { id: quizId } : { id: quizId, version: opts.expectedVersion };
    const bumped = await tx.quiz.updateMany({ where, data: { version: { increment: 1 } } });
    if (bumped.count !== 1) {
      const cur = await tx.quiz.findUnique({ where: { id: quizId }, select: { version: true } });
      if (!cur) throw new QuizNotFoundError();
      throw new VersionConflictError(cur.version);
    }
    const { version } = await tx.quiz.findUniqueOrThrow({ where: { id: quizId }, select: { version: true } });

    // 2) Oldingi holat tarixga (qulf ostida — izchil)
    const snap = await snapshotOf(tx, quizId);
    await tx.quizRevision.create({
      data: {
        quizId,
        version: version - 1,
        snapshot: snap as unknown as Prisma.InputJsonValue,
        source: opts.source,
        actorId: opts.actor.id,
        actorName: opts.actor.name ?? null,
        summary: opts.summary.slice(0, 500),
      },
    });
    const old = await tx.quizRevision.findMany({
      where: { quizId },
      orderBy: { createdAt: "desc" },
      skip: MAX_REVISIONS,
      select: { id: true },
    });
    if (old.length) await tx.quizRevision.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });

    // 3) O'zgarish
    const result = await fn(tx);
    return { result, version };
  }, { timeout: 20_000, maxWait: 10_000 }); // katta quiz (300 slayd) saqlash ham sig'sin
}

/** Barcha slaydlarni almashtiradi (muharrir saqlashi va tarixdan tiklash). */
export async function replaceSlides(tx: Prisma.TransactionClient, quizId: string, slides: QuizSnapshot["slides"]): Promise<void> {
  await tx.slide.deleteMany({ where: { quizId } });
  if (slides.length === 0) return;
  await tx.slide.createMany({
    data: slides.map((s, i) => ({
      quizId,
      order: i,
      kind: s.kind,
      type: s.type ?? null,
      data: JSON.stringify(s.data ?? {}),
      notes: s.notes ?? null,
      timeLimit: s.timeLimit,
      points: s.points,
    })),
  });
}

/**
 * Bitta slaydni `position` (1 dan; berilmasa — oxiriga) o'ringa qo'shadi. Boshqa slaydlarning
 * id'lari o'zgarmaydi (faqat tartib raqami suriladi). Qaytaradi: yangi slayd id va o'rni.
 */
export async function insertSlide(
  tx: Prisma.TransactionClient,
  quizId: string,
  slide: QuizSnapshot["slides"][number],
  position?: number,
): Promise<{ id: string; position: number }> {
  const rows = await tx.slide.findMany({ where: { quizId }, orderBy: { order: "asc" }, select: { id: true, order: true } });
  // Tartib raqamlarini 0..n-1 ga keltiramiz (eski ma'lumotda bo'shliqlar bo'lishi mumkin)
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].order !== i) await tx.slide.update({ where: { id: rows[i].id }, data: { order: i } });
  }
  const idx = position === undefined ? rows.length : Math.min(Math.max(position - 1, 0), rows.length);
  if (idx < rows.length) {
    await tx.slide.updateMany({ where: { quizId, order: { gte: idx } }, data: { order: { increment: 1 } } });
  }
  const created = await tx.slide.create({
    data: {
      quizId,
      order: idx,
      kind: slide.kind,
      type: slide.type ?? null,
      data: JSON.stringify(slide.data ?? {}),
      notes: slide.notes ?? null,
      timeLimit: slide.timeLimit,
      points: slide.points,
    },
    select: { id: true },
  });
  return { id: created.id, position: idx + 1 };
}

export async function updateSlideRow(tx: Prisma.TransactionClient, slideId: string, slide: QuizSnapshot["slides"][number]): Promise<void> {
  await tx.slide.update({
    where: { id: slideId },
    data: {
      type: slide.type ?? null, // change_slide_type uchun
      data: JSON.stringify(slide.data ?? {}),
      notes: slide.notes ?? null,
      timeLimit: slide.timeLimit,
      points: slide.points,
    },
  });
}

/** Slaydlar tartibini berilgan id ketma-ketligiga keltiradi (id'lar o'zgarmaydi). */
export async function reorderSlides(tx: Prisma.TransactionClient, quizId: string, orderedIds: string[]): Promise<void> {
  const rows = await tx.slide.findMany({ where: { quizId }, select: { id: true, order: true } });
  const ids = new Set(rows.map((r) => r.id));
  if (rows.length !== orderedIds.length || orderedIds.some((id) => !ids.has(id))) throw new QuizNotFoundError();
  const cur = new Map(rows.map((r) => [r.id, r.order]));
  for (let i = 0; i < orderedIds.length; i++) {
    if (cur.get(orderedIds[i]) !== i) await tx.slide.update({ where: { id: orderedIds[i] }, data: { order: i } });
  }
}

/** Yangi quiz (tarix kerak emas — oldingi holat yo'q). */
export async function createQuizWithSlides(
  teacherId: string,
  title: string,
  description: string | null,
  folderId: string | null,
  slides: QuizSnapshot["slides"],
): Promise<{ id: string }> {
  return prisma.quiz.create({
    data: {
      title,
      description,
      teacherId,
      folderId,
      slides: {
        create: slides.map((s, i) => ({
          order: i,
          kind: s.kind,
          type: s.type ?? null,
          data: JSON.stringify(s.data ?? {}),
          notes: s.notes ?? null,
          timeLimit: s.timeLimit,
          points: s.points,
        })),
      },
    },
    select: { id: true },
  });
}
