import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { prisma } from "../../prisma.js";
import { quizAccess } from "../../lib/quizAccess.js";
import { parseSlide } from "../../lib/slides.js";
import { guard, ok, run, McpToolError, type McpContext } from "../context.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Faqat o'qish tool'lari (1-bosqich). Hech narsani o'zgartirmaydi. ----

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const SLIDE_ID_NOTE =
  "Diqqat: ustoz muharrirda quizni saqlaganda slayd id'lari yangilanadi — doim eng oxirgi get_quiz natijasidagi id'larni ishlating.";

function clip(s: unknown, n = 120): string {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// Slaydning bir qatorli qisqa sarlavhasi (ro'yxat uchun)
function slideHeadline(kind: string, data: any): string {
  if (kind === "QUESTION") return clip(data?.text) || "(matnsiz savol)";
  if (Array.isArray(data?.elements)) {
    const texts = data.elements
      .filter((e: any) => e?.type === "text" && String(e.text ?? "").trim())
      .sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
    if (texts.length > 0) return clip(texts[0].text);
    return "(kontent slayd)";
  }
  return clip(data?.title || data?.body) || "(kontent slayd)";
}

// To'liq slayd ma'lumoti — qalam chizmalarining (draw) nuqtalari juda katta bo'lgani uchun
// faqat soni ko'rsatiladi (Claude'ga keraksiz yuk).
function slimData(data: any): any {
  if (!data || !Array.isArray(data.elements)) return data;
  return {
    ...data,
    elements: data.elements.map((e: any) =>
      e?.type === "draw" ? { ...e, points: undefined, pointCount: Array.isArray(e.points) ? e.points.length : 0 } : e,
    ),
  };
}

async function linkedQuizIds(): Promise<string[]> {
  const rows = await Promise.all([
    prisma.lessonPlan.findMany({ where: { quizId: { not: null } }, select: { quizId: true } }),
    prisma.workshop.findMany({ where: { quizId: { not: null } }, select: { quizId: true } }),
    prisma.extraLesson.findMany({ where: { quizId: { not: null } }, select: { quizId: true } }),
    prisma.newCurriculumLesson.findMany({ where: { quizId: { not: null } }, select: { quizId: true } }),
  ]);
  return [...new Set(rows.flat().map((r) => r.quizId!).filter(Boolean))];
}

export function registerReadTools(server: McpServer, ctx: McpContext): void {
  server.registerTool(
    "list_folders",
    {
      title: "Papkalar ro'yxati",
      description:
        "Foydalanuvchining Robbit Quiz kutubxonasidagi papkalar (ichma-ich: parentId — ota papka, null = yuqori daraja). " +
        "Har papkada quizlar soni. Admin barcha ustozlarning papkalarini ko'radi (owner bilan).",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    () =>
      run(async () => {
        const me = await guard(ctx, "quiz:read");
        const folders = await prisma.folder.findMany({
          where: me.isAdmin ? {} : { teacherId: me.id },
          orderBy: { name: "asc" },
          take: 1000,
          include: { _count: { select: { quizzes: true } }, teacher: { select: { name: true } } },
        });
        return ok({
          folders: folders.map((f) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId,
            quizCount: f._count.quizzes,
            ...(me.isAdmin && f.teacherId !== me.id ? { owner: f.teacher.name } : {}),
          })),
        });
      }),
  );

  server.registerTool(
    "list_quizzes",
    {
      title: "Quizlarni qidirish",
      description:
        "Quizlarni nom bo'yicha qidiradi. source='mine' — foydalanuvchining o'z quizlari (admin uchun — hammasi); " +
        "source='curriculum' — o'quv dasturga biriktirilgan umumiy quizlar. folderId bilan papka bo'yicha cheklash mumkin. " +
        "Natijada canEdit — foydalanuvchi shu quizni tahrirlay oladimi.",
      inputSchema: {
        query: z.string().max(200).optional().describe("Nomida qidiriladigan matn (katta-kichik harf farqsiz)"),
        folderId: z.string().max(100).optional().describe("Faqat shu papkadagi quizlar"),
        source: z.enum(["mine", "curriculum"]).optional().describe("Standart: mine"),
        limit: z.number().int().min(1).max(100).optional().describe("Standart: 50"),
      },
      annotations: READ_ONLY,
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:read");
        const source = args.source ?? "mine";
        const where: any = {};
        if (source === "curriculum") where.id = { in: await linkedQuizIds() };
        else if (!me.isAdmin) where.teacherId = me.id;
        if (args.query?.trim()) where.title = { contains: args.query.trim(), mode: "insensitive" };
        if (args.folderId) where.folderId = args.folderId;
        const quizzes = await prisma.quiz.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          take: args.limit ?? 50,
          include: { _count: { select: { slides: true } }, teacher: { select: { name: true } } },
        });
        const canWrite = me.scopes.includes("quiz:write");
        return ok({
          quizzes: quizzes.map((q) => {
            const own = q.teacherId === me.id;
            return {
              id: q.id,
              title: q.title,
              folderId: q.folderId,
              slideCount: q._count.slides,
              updatedAt: q.updatedAt,
              ...(own ? {} : { owner: q.teacher.name }),
              // Admin — hammasi; aks holda o'zi yoki o'quv dasturdagi (curriculum) quiz
              canEdit: canWrite && (me.isAdmin || own || source === "curriculum"),
            };
          }),
        });
      }),
  );

  server.registerTool(
    "get_quiz",
    {
      title: "Quiz va slaydlari",
      description:
        "Bitta quiz: nomi, tavsifi va slaydlarning qisqa ro'yxati (id, tartib raqami — position 1 dan, " +
        "kind: CONTENT|QUESTION, type: savol turi, title — qisqa sarlavha). Slaydning to'liq mazmuni uchun get_slide. " +
        SLIDE_ID_NOTE,
      inputSchema: { quizId: z.string().min(1).max(100) },
      annotations: READ_ONLY,
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:read");
        const access = await quizAccess(me.id, args.quizId);
        if (!access?.view) throw new McpToolError("Quiz topilmadi yoki uni ko'rish huquqingiz yo'q.");
        const quiz = await prisma.quiz.findUnique({
          where: { id: args.quizId },
          include: { slides: { orderBy: { order: "asc" } }, folder: { select: { id: true, name: true } } },
        });
        if (!quiz) throw new McpToolError("Quiz topilmadi.");
        return ok({
          id: quiz.id,
          title: quiz.title,
          description: quiz.description,
          shuffle: quiz.shuffle,
          folder: quiz.folder,
          updatedAt: quiz.updatedAt,
          // Yozuvchi tool'lar (add_slide, update_slide) shu versiyani talab qiladi
          version: quiz.version,
          canEdit: access.edit && me.scopes.includes("quiz:write"),
          slideCount: quiz.slides.length,
          slides: quiz.slides.map((s, i) => {
            const p = parseSlide(s);
            return { id: s.id, position: i + 1, kind: s.kind, type: s.type, title: slideHeadline(s.kind, p.data) };
          }),
        });
      }),
  );

  server.registerTool(
    "get_slide",
    {
      title: "Slaydning to'liq ma'lumoti",
      description:
        "Bitta slaydning to'liq ma'lumoti: kind, type, data (savol matni, variantlar va to'g'ri javoblar, juftliklar, " +
        "tartib elementlari yoki kontent slayd kanvas elementlari), notes (ustoz izohi), timeLimit (soniya), points. " +
        "O'zgartirishdan oldin har doim shu tool bilan joriy holatni o'qing. " +
        SLIDE_ID_NOTE,
      inputSchema: { quizId: z.string().min(1).max(100), slideId: z.string().min(1).max(100) },
      annotations: READ_ONLY,
    },
    (args) =>
      run(async () => {
        const me = await guard(ctx, "quiz:read");
        const access = await quizAccess(me.id, args.quizId);
        if (!access?.view) throw new McpToolError("Quiz topilmadi yoki uni ko'rish huquqingiz yo'q.");
        const slides = await prisma.slide.findMany({ where: { quizId: args.quizId }, orderBy: { order: "asc" } });
        const idx = slides.findIndex((s) => s.id === args.slideId);
        if (idx < 0) {
          throw new McpToolError("Slayd topilmadi — quiz muharrirda saqlangan bo'lishi mumkin. get_quiz bilan yangi ro'yxatni oling.");
        }
        const p = parseSlide(slides[idx]);
        const q = await prisma.quiz.findUnique({ where: { id: args.quizId }, select: { version: true } });
        return ok({ quizId: args.quizId, quizVersion: q?.version, position: idx + 1, slideCount: slides.length, ...p, data: slimData(p.data) });
      }),
  );
}
