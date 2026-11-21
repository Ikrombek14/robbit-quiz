import { prisma } from "../prisma.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Darslar katalogi (MCP uchun yagona ko'rinish) ----
// Platformada 4 xil dars ro'yxati bor; har birida quizId — darsga biriktirilgan slaydlar (quiz).
// "Quiz" platformada slaydlar to'plami: kontent slaydlar + savollar (QUESTION) bitta to'plamda.

export const CATALOGS = ["curriculum", "new_curriculum", "workshop", "extra"] as const;
export type Catalog = (typeof CATALOGS)[number];

export const CATALOG_LABELS: Record<Catalog, string> = {
  curriculum: "O'quv dastur",
  new_curriculum: "Yangi o'quv dastur",
  workshop: "Workshop",
  extra: "Qo'shimcha dars",
};

export interface LessonRow {
  catalog: Catalog;
  id: string;
  title: string;
  quizId: string | null;
  order: number;
  group: string; // fan / modul — ro'yxatda guruhlash uchun
  meta: Record<string, unknown>;
}

const SUBJECT: Record<string, string> = { ROBOTEXNIKA: "Robototexnika", DASTURLASH: "Dasturlash" };
const AGE: Record<string, string> = { JUNIOR: "Kichik", MIDDLE: "O'rta", SENIOR: "Katta" };

export async function loadLessons(catalog?: Catalog): Promise<LessonRow[]> {
  const want = (c: Catalog) => !catalog || catalog === c;
  const [plans, news, works, extras] = await Promise.all([
    want("curriculum") ? prisma.lessonPlan.findMany({ orderBy: [{ subject: "asc" }, { ageGroup: "asc" }, { year: "asc" }, { order: "asc" }] }) : [],
    want("new_curriculum") ? prisma.newCurriculumLesson.findMany({ orderBy: [{ module: "asc" }, { order: "asc" }] }) : [],
    want("workshop") ? prisma.workshop.findMany({ orderBy: { order: "asc" } }) : [],
    want("extra") ? prisma.extraLesson.findMany({ orderBy: { order: "asc" } }) : [],
  ]);
  return [
    ...plans.map((l) => ({
      catalog: "curriculum" as const,
      id: l.id,
      title: l.title,
      quizId: l.quizId,
      order: l.order,
      group: `${SUBJECT[l.subject] ?? l.subject} · ${AGE[l.ageGroup] ?? l.ageGroup} · ${l.year}-yil${l.section ? ` · ${l.section}` : ""}`,
      meta: { subject: l.subject, ageGroup: l.ageGroup, year: l.year, section: l.section },
    })),
    ...news.map((l) => ({ catalog: "new_curriculum" as const, id: l.id, title: l.title, quizId: l.quizId, order: l.order, group: l.module, meta: { module: l.module } })),
    ...works.map((l) => ({ catalog: "workshop" as const, id: l.id, title: l.title, quizId: l.quizId, order: l.order, group: "Workshoplar", meta: {} })),
    ...extras.map((l) => ({ catalog: "extra" as const, id: l.id, title: l.title, quizId: l.quizId, order: l.order, group: "Qo'shimcha darslar", meta: {} })),
  ];
}

export async function findLesson(catalog: Catalog, id: string): Promise<LessonRow | null> {
  return (await loadLessons(catalog)).find((l) => l.id === id) ?? null;
}

/**
 * Darsga quiz biriktiradi — faqat darsdagi hozirgi qiymat `expected` bo'lsa (null yoki o'chirilgan
 * quizning eskirgan id'si). Ishlab turgan biriktirishni almashtirish faqat platformada.
 */
export async function attachQuizIfUnchanged(catalog: Catalog, lessonId: string, quizId: string, expected: string | null): Promise<boolean> {
  const where = { id: lessonId, quizId: expected };
  const data = { quizId };
  const r =
    catalog === "curriculum" ? await prisma.lessonPlan.updateMany({ where, data })
      : catalog === "new_curriculum" ? await prisma.newCurriculumLesson.updateMany({ where, data })
        : catalog === "workshop" ? await prisma.workshop.updateMany({ where, data })
          : await prisma.extraLesson.updateMany({ where, data });
  return r.count === 1;
}

/** Quizlar bo'yicha slaydlar tarkibi: nechta kontent va nechta savol. */
export async function slideStats(quizIds: string[]): Promise<Map<string, { content: number; questions: number }>> {
  const m = new Map<string, { content: number; questions: number }>();
  if (quizIds.length === 0) return m;
  const rows = await prisma.slide.groupBy({ by: ["quizId", "kind"], where: { quizId: { in: quizIds } }, _count: { _all: true } });
  for (const r of rows as any[]) {
    const o = m.get(r.quizId) ?? { content: 0, questions: 0 };
    if (r.kind === "QUESTION") o.questions += r._count._all;
    else o.content += r._count._all;
    m.set(r.quizId, o);
  }
  return m;
}
