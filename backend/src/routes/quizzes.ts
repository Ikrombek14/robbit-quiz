import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireCanCreate, type AuthedRequest } from "../auth.js";
import { isAdminUser, isLinkedQuiz, maxRemovable } from "../lib/quizAccess.js";
import { parseSlide } from "../lib/slides.js";
import { auditNote } from "../lib/audit.js";
import { writeQuiz, replaceSlides, VersionConflictError, type QuizSnapshot } from "../lib/quizWrite.js";

export const quizRouter = Router();
quizRouter.use(requireAuth);

const slideSchema = z.object({
  kind: z.enum(["CONTENT", "QUESTION"]),
  type: z.string().nullable().optional(),
  data: z.any().default({}),
  notes: z.string().nullable().optional(),
  timeLimit: z.number().int().min(5).max(300).default(20),
  points: z.number().int().min(0).max(2000).default(1000),
});

const quizSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  shuffle: z.boolean().optional().default(false),
  slides: z.array(slideSchema).default([]),
  // Muharrir ochilganda olgan versiya — boshqa joyda (Claude/MCP) o'zgargan bo'lsa saqlash
  // rad etiladi (409). Yubormagan eski klient vaqtincha tekshiruvsiz qabul qilinadi.
  version: z.number().int().min(1).optional(),
});

type SlideInput = z.infer<typeof slideSchema>;

function buildSlideCreate(slides: SlideInput[]) {
  return slides.map((s, i) => ({
    order: i,
    kind: s.kind,
    type: s.type ?? null,
    data: JSON.stringify(s.data ?? {}),
    notes: s.notes ?? null,
    timeLimit: s.timeLimit,
    points: s.points,
  }));
}


// Ro'yxat — admin barcha o'qituvchilarning loyihalarini ko'radi (egasi bilan)
quizRouter.get("/", async (req: AuthedRequest, res) => {
  const admin = await isAdminUser(req.teacherId);
  const quizzes = await prisma.quiz.findMany({
    where: admin ? {} : { teacherId: req.teacherId },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { slides: true } },
      teacher: { select: { id: true, name: true, email: true } },
    },
  });
  res.json({
    isAdmin: admin,
    quizzes: quizzes.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      updatedAt: q.updatedAt,
      folderId: q.folderId,
      _count: q._count,
      owner: { id: q.teacher.id, name: q.teacher.name, email: q.teacher.email },
      mine: q.teacherId === req.teacherId,
    })),
  });
});

// Bitta quiz (to'liq) — admin har qanday loyihani ko'ra oladi.
// O'quv dasturga biriktirilgan quizni esa har qanday login ustoz ko'ra oladi (preview/host uchun).
quizRouter.get("/:id", async (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  const me = await prisma.teacher.findUnique({ where: { id: req.teacherId }, select: { isAdmin: true, canCreate: true } });
  const admin = me?.isAdmin === true;
  let quiz = await prisma.quiz.findFirst({
    where: admin ? { id } : { id, teacherId: req.teacherId },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  let linked = false;
  if (!quiz && !admin) {
    // O'quv dasturlarga biriktirilgan quizni har qanday ustoz ko'ra oladi (preview/host uchun)
    linked = await isLinkedQuiz(id);
    if (linked) {
      quiz = await prisma.quiz.findUnique({
        where: { id },
        include: { slides: { orderBy: { order: "asc" } } },
      });
    }
  }
  if (!quiz) {
    res.status(404).json({ error: "Quiz topilmadi" });
    return;
  }
  const own = quiz.teacherId === req.teacherId;
  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      shuffle: quiz.shuffle,
      version: quiz.version,
      // Versiyalar tarixidan tiklash — faqat egasi va admin
      canRestore: admin || own,
      // Tahrirlash huquqi: admin, egasi, yoki o'quv dasturdagi slayd uchun slaydchi (canCreate)
      mine: admin || own || (linked && me?.canCreate === true),
      // Butun slaydni o'chirish — faqat admin
      canDelete: admin,
      // Boshqaning slaydini tahrirlayotgan slaydchi — sahifa o'chirish cheklangan
      limitedRemove: !admin && !own,
      slides: quiz.slides.map(parseSlide),
    },
  });
});

// Yaratish — "slayd qilish" ruxsati kerak
quizRouter.post("/", requireCanCreate, async (req: AuthedRequest, res) => {
  const parsed = quizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const { title, description, shuffle, slides } = parsed.data;
  const quiz = await prisma.quiz.create({
    data: {
      title,
      description: description ?? null,
      shuffle,
      teacherId: req.teacherId!,
      slides: { create: buildSlideCreate(slides) },
    },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      shuffle: quiz.shuffle,
      slides: quiz.slides.map(parseSlide),
    },
  });
});

// Loyihalarni papkaga ko'chirish (bir nechtasini birdan) — folderId null = papkadan chiqarish
const moveSchema = z.object({
  ids: z.array(z.string()).min(1),
  folderId: z.string().nullable(),
});
quizRouter.post("/move", requireCanCreate, async (req: AuthedRequest, res) => {
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const admin = await isAdminUser(req.teacherId);
  const { ids, folderId } = parsed.data;
  // Papka ko'rsatilsa — egasi (yoki admin) ekanini tekshiramiz
  if (folderId) {
    const folder = await prisma.folder.findFirst({
      where: admin ? { id: folderId } : { id: folderId, teacherId: req.teacherId },
    });
    if (!folder) {
      res.status(404).json({ error: "Papka topilmadi" });
      return;
    }
  }
  // Faqat o'ziga tegishli (admin bo'lsa hammasi) loyihalarni ko'chiramiz
  const r = await prisma.quiz.updateMany({
    where: admin ? { id: { in: ids } } : { id: { in: ids }, teacherId: req.teacherId },
    data: { folderId },
  });
  res.json({ moved: r.count });
});

// Yangilash (slaydlar to'liq almashtiriladi) — "slayd qilish" ruxsati kerak
quizRouter.put("/:id", requireCanCreate, async (req: AuthedRequest, res) => {
  const parsed = quizSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const admin = await isAdminUser(req.teacherId);
  const id = String(req.params.id);
  const target = await prisma.quiz.findUnique({
    where: { id },
    select: { id: true, teacherId: true, _count: { select: { slides: true } } },
  });
  if (!target) {
    res.status(404).json({ error: "Quiz topilmadi" });
    return;
  }
  const own = target.teacherId === req.teacherId;
  // Admin — hammasi; slaydchi — o'zinikini yoki o'quv dasturga biriktirilganini
  if (!admin && !own && !(await isLinkedQuiz(id))) {
    res.status(404).json({ error: "Quiz topilmadi" });
    return;
  }
  const { title, description, shuffle, slides, version } = parsed.data;
  if (!admin && !own) {
    const removed = target._count.slides - slides.length;
    const limit = maxRemovable(target._count.slides);
    if (removed > limit) {
      res.status(403).json({
        error: `Bir saqlashda ko'pi bilan ${limit} ta sahifa o'chirish mumkin (siz ${removed} ta o'chirdingiz). Ko'proq o'chirish kerak bo'lsa adminga murojaat qiling.`,
      });
      return;
    }
  }
  if (version === undefined) console.warn(`[quiz ${target.id}] PUT version'siz keldi (eski klient) — konflikt tekshiruvisiz saqlandi`);
  const actor = await prisma.teacher.findUnique({ where: { id: req.teacherId }, select: { id: true, name: true } });
  // Versiya tekshiruvi + oldingi holatni tarixga yozish + slaydlarni almashtirish — bitta tranzaksiyada
  let newVersion: number;
  try {
    const w = await writeQuiz(
      target.id,
      { expectedVersion: version, source: "editor", actor: { id: req.teacherId!, name: actor?.name }, summary: "Muharrirda saqlandi" },
      async (tx) => {
        await tx.quiz.update({ where: { id: target.id }, data: { title, description: description ?? null, shuffle } });
        await replaceSlides(tx, target.id, slides.map((s) => ({ ...s, data: s.data ?? {}, type: s.type ?? null, notes: s.notes ?? null })));
      },
    );
    newVersion = w.version;
  } catch (e) {
    if (e instanceof VersionConflictError) {
      res.status(409).json({
        error: "Bu quiz boshqa joyda (masalan Claude orqali) o'zgartirildi. Ishingiz shu sahifada turibdi — kerak bo'lsa nusxa olib, sahifani qayta yuklang.",
        code: "VERSION_CONFLICT",
        currentVersion: e.currentVersion,
      });
      return;
    }
    throw e;
  }
  const quiz = await prisma.quiz.findUniqueOrThrow({ where: { id: target.id }, include: { slides: { orderBy: { order: "asc" } } } });
  res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      shuffle: quiz.shuffle,
      version: newVersion,
      slides: quiz.slides.map(parseSlide),
    },
  });
});

// ---- Versiyalar tarixi (oxirgi 20 ta) — egasi va admin ----
async function canRestore(teacherId: string, quizId: string): Promise<boolean> {
  const [admin, quiz] = await Promise.all([
    isAdminUser(teacherId),
    prisma.quiz.findUnique({ where: { id: quizId }, select: { teacherId: true } }),
  ]);
  return !!quiz && (admin || quiz.teacherId === teacherId);
}

quizRouter.get("/:id/revisions", async (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  if (!(await canRestore(req.teacherId!, id))) {
    res.status(404).json({ error: "Quiz topilmadi" });
    return;
  }
  const revs = await prisma.quizRevision.findMany({ where: { quizId: id }, orderBy: { createdAt: "desc" } });
  res.json({
    revisions: revs.map((r) => {
      const snap = r.snapshot as unknown as QuizSnapshot;
      return {
        id: r.id,
        version: r.version,
        source: r.source,
        actorName: r.actorName,
        summary: r.summary,
        createdAt: r.createdAt,
        title: snap?.title ?? "",
        slideCount: Array.isArray(snap?.slides) ? snap.slides.length : 0,
      };
    }),
  });
});

quizRouter.post("/:id/revisions/:revId/restore", requireCanCreate, async (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  if (!(await canRestore(req.teacherId!, id))) {
    res.status(403).json({ error: "Versiyani faqat quiz egasi yoki admin tiklay oladi" });
    return;
  }
  const rev = await prisma.quizRevision.findFirst({ where: { id: String(req.params.revId), quizId: id } });
  if (!rev) {
    res.status(404).json({ error: "Versiya topilmadi" });
    return;
  }
  const snap = rev.snapshot as unknown as QuizSnapshot;
  const actor = await prisma.teacher.findUnique({ where: { id: req.teacherId }, select: { name: true } });
  const w = await writeQuiz(
    id,
    { source: "restore", actor: { id: req.teacherId!, name: actor?.name }, summary: `${rev.version}-versiyaga qaytarildi` },
    async (tx) => {
      await tx.quiz.update({ where: { id }, data: { title: snap.title, description: snap.description ?? null, shuffle: !!snap.shuffle } });
      await replaceSlides(tx, id, snap.slides ?? []);
    },
  );
  auditNote(res, {
    action: "quiz.revision.restore",
    entity: "Quiz",
    entityId: id,
    summary: `"${snap.title}" quizi ${rev.version}-versiyaga qaytarildi`,
    details: { revisionId: rev.id, fromVersion: rev.version, newVersion: w.version },
  });
  res.json({ ok: true, version: w.version });
});

// O'chirish — FAQAT admin. Slaydchi (canCreate) tahrirlay oladi, lekin o'chira olmaydi,
// hatto o'zi yaratganini ham (slaydlar tasodifan yo'qolmasin).
quizRouter.delete("/:id", requireCanCreate, async (req: AuthedRequest, res) => {
  const admin = await isAdminUser(req.teacherId);
  if (!admin) {
    res.status(403).json({ error: "Slaydni faqat admin o'chira oladi. O'chirish kerak bo'lsa adminga murojaat qiling." });
    return;
  }
  const owned = await prisma.quiz.findUnique({ where: { id: String(req.params.id) } });
  if (!owned) {
    res.status(404).json({ error: "Quiz topilmadi" });
    return;
  }
  await prisma.quiz.delete({ where: { id: owned.id } });
  res.json({ ok: true });
});
