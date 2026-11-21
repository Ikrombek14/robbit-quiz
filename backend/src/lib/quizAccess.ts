import { prisma } from "../prisma.js";

// Quiz ko'rish/tahrirlash huquqlari — REST (routes/quizzes.ts) va MCP bir xil qoidaga
// bo'ysunishi uchun shu yerda turadi. Qoidalar:
//   admin — hammasi;
//   egasi — o'z quizi;
//   o'quv dasturga biriktirilgan quiz — har qanday ustoz KO'RA oladi, slaydchi (canCreate)
//   TAHRIRLAY oladi (bir saqlashda ko'pi bilan maxRemovable sahifa o'chirib).

// Joriy foydalanuvchi admin'mi? (admin barcha o'qituvchilarning quizlarini ko'radi/boshqaradi)
export async function isAdminUser(teacherId?: string): Promise<boolean> {
  if (!teacherId) return false;
  const t = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { isAdmin: true } });
  return t?.isAdmin === true;
}

// Quiz biror o'quv dasturga (O'quv dastur, Yangi o'quv dastur, Qo'shimcha darslar,
// Workshoplar) biriktirilganmi — bunday slaydlar umumiy hisoblanadi.
export async function isLinkedQuiz(id: string): Promise<boolean> {
  const [a, b, c, d] = await Promise.all([
    prisma.lessonPlan.findFirst({ where: { quizId: id }, select: { id: true } }),
    prisma.workshop.findFirst({ where: { quizId: id }, select: { id: true } }),
    prisma.extraLesson.findFirst({ where: { quizId: id }, select: { id: true } }),
    prisma.newCurriculumLesson.findFirst({ where: { quizId: id }, select: { id: true } }),
  ]);
  return Boolean(a || b || c || d);
}

// Boshqaning slaydini tahrirlayotgan slaydchi bir saqlashda ko'pi bilan shuncha
// sahifani o'chira oladi — slaydni "bo'shatib" qo'yishdan himoya.
export function maxRemovable(oldCount: number): number {
  return Math.max(2, Math.floor(oldCount * 0.2));
}

export interface QuizAccess {
  view: boolean;
  edit: boolean;
  own: boolean;
  linked: boolean;
  // Boshqaning (biriktirilgan) quizini tahrirlayotgan slaydchi — o'chirish cheklangan
  limitedRemove: boolean;
}

// Bitta quiz bo'yicha foydalanuvchi huquqlari (quiz topilmasa — null)
export async function quizAccess(teacherId: string, quizId: string): Promise<QuizAccess | null> {
  const [me, quiz] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: teacherId }, select: { isAdmin: true, canCreate: true } }),
    prisma.quiz.findUnique({ where: { id: quizId }, select: { teacherId: true } }),
  ]);
  if (!me || !quiz) return null;
  const admin = me.isAdmin === true;
  const own = quiz.teacherId === teacherId;
  const linked = !admin && !own ? await isLinkedQuiz(quizId) : false;
  const canCreate = admin || me.canCreate === true;
  return {
    view: admin || own || linked,
    edit: canCreate && (admin || own || linked),
    own,
    linked,
    limitedRemove: !admin && !own,
  };
}
