import { Router, type Response, type NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireApproved, requireCanCreate, type AuthedRequest } from "../auth.js";
import { sortLessons, bestKeyAI, type OrderGroup } from "../services/curriculumOrder.js";
import { extractTopicForQuiz } from "../services/slideTopics.js";
import { analyzeLesson } from "../services/lessonAI.js";

export const curriculumRouter = Router();
curriculumRouter.use(requireAuth);

// Faqat admin uchun middleware
async function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const teacher = await prisma.teacher.findUnique({ where: { id: req.teacherId } });
  if (!teacher?.isAdmin) {
    res.status(403).json({ error: "Bu amal faqat admin uchun ruxsat etilgan" });
    return;
  }
  next();
}

const lessonSchema = z.object({
  subject: z.enum(["ROBOTEXNIKA", "DASTURLASH"]),
  ageGroup: z.enum(["MIDDLE", "SENIOR"]),
  year: z.number().int().min(1).max(4),
  section: z.string().nullable().optional(),
  order: z.number().int().default(0),
  title: z.string().min(1),
  author: z.string().nullable().optional(),
  isDemo: z.boolean().default(false),
  quizId: z.string().nullable().optional(),
});

// Dars sarlavhasi boshidagi tartib prefiksini tozalaydi ("1-dars. ", "12. ",
// "3) ") — ro'yxatда/dastur ko'rinishida raqam allaqachon qo'yiladi, takror bo'lmasin.
function cleanTitle(raw: string): string {
  const t = String(raw ?? "").trim();
  const stripped = t.replace(/^\s*\d+\s*[-.)]?\s*(dars\s*[.:]?)?\s*/i, "").trim();
  return (stripped || t).slice(0, 200);
}

// Guruhdagi barcha darslarni o'quv reja bo'yicha AVTOMATIK qayta tartiblaydi.
// Stabil: reja-signali bo'lmagan darslar mavjud tartibda oxirida qoladi.
// Qaytaradi: nechta darsning o'rni o'zgargani.
async function autoReorderGroup(group: OrderGroup): Promise<number> {
  const lessons = await prisma.lessonPlan.findMany({
    where: { subject: group.subject, ageGroup: group.ageGroup, year: group.year, section: group.section },
    orderBy: { order: "asc" },
    select: { id: true, title: true, order: true, quizId: true, aiModule: true, aiSeq: true },
  });
  if (lessons.length < 2) return 0;
  // Biriktirilgan quiz sarlavhalari — dars nomi tozalangan bo'lsa kanonik
  // raqam quiz nomida qolgan bo'lishi mumkin (bestKeyAI hammasini ko'radi)
  const quizIds = lessons.map((l) => l.quizId).filter((x): x is string => Boolean(x));
  const quizzes = quizIds.length
    ? await prisma.quiz.findMany({ where: { id: { in: quizIds } }, select: { id: true, title: true } })
    : [];
  const qmap = new Map(quizzes.map((q) => [q.id, q.title]));
  const sorted = lessons
    .map((l, i) => ({
      l,
      key: bestKeyAI(l.title, l.quizId ? qmap.get(l.quizId) : undefined, l.aiModule, l.aiSeq, group),
      i,
    }))
    .sort((a, b) => a.key.pos - b.key.pos || a.key.sub - b.key.sub || a.l.order - b.l.order || a.i - b.i)
    .map((x) => x.l);
  const updates = sorted
    .map((l, i) => ({ id: l.id, from: l.order, to: i }))
    .filter((u) => u.from !== u.to);
  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) => prisma.lessonPlan.update({ where: { id: u.id }, data: { order: u.to } })),
    );
  }
  return updates.length;
}

// Guruh raqamlarini ZICHLAYDI (0..n-1) — mavjud nisbiy tartibni saqlagan holda.
// O'chirish/ko'chirishdan keyin teshik va dublikat qolmasligi uchun.
async function compactGroup(group: OrderGroup): Promise<void> {
  const ls = await prisma.lessonPlan.findMany({
    where: { subject: group.subject, ageGroup: group.ageGroup, year: group.year, section: group.section },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });
  const fixes = ls.map((l, i) => ({ id: l.id, from: l.order, to: i })).filter((x) => x.from !== x.to);
  if (fixes.length > 0) {
    await prisma.$transaction(
      fixes.map((x) => prisma.lessonPlan.update({ where: { id: x.id }, data: { order: x.to } })),
    );
  }
}

// ---- AI-TARTIBLASH FON JARAYONI ------------------------------------------
// Wayground importidan keyin (yoki tugma bilan) guruhdagi har darsning
// slaydlari AI'ga o'rgatiladi: toza mavzu nomi + modul + ichki o'rin.
// Nom faqat ishonch >= 85 bo'lsa yangilanadi (dars + quiz birga).
// Oxirida guruh o'quv reja bo'yicha qayta tartiblanadi.
// PM2 bitta instance (fork) — in-memory holat yetarli.
interface AiJob {
  total: number;
  done: number;
  renamed: number;
  failed: number;
  lowConfidence: string[]; // ishonchi past chiqqan dars nomlari (ko'rib chiqish uchun)
  running: boolean;
  startedAt: number;
  finishedAt: number | null;
  error?: string;
}
const aiJobs = new Map<string, AiJob>();
const groupKey = (g: OrderGroup) => `${g.subject}|${g.ageGroup}|${g.year}|${g.section ?? ""}`;

// Jarayonni boshlaydi (agar shu guruhda allaqachon ketayotgan bo'lmasa).
// force=false: faqat hali AI ko'rmagan (aiModule=null) darslar ishlanadi.
async function startAiOrganize(group: OrderGroup, force: boolean): Promise<AiJob | { alreadyRunning: true }> {
  const key = groupKey(group);
  if (aiJobs.get(key)?.running) return { alreadyRunning: true };

  const lessons = await prisma.lessonPlan.findMany({
    where: {
      subject: group.subject, ageGroup: group.ageGroup, year: group.year, section: group.section,
      quizId: { not: null },
      ...(force ? {} : { aiModule: null }),
    },
    select: { id: true, title: true, quizId: true },
  });

  const job: AiJob = {
    total: lessons.length, done: 0, renamed: 0, failed: 0,
    lowConfidence: [], running: lessons.length > 0,
    startedAt: Date.now(), finishedAt: lessons.length > 0 ? null : Date.now(),
  };
  aiJobs.set(key, job);
  if (lessons.length === 0) return job;

  // Fonda ishlaydi — so'rov kutmaydi
  void (async () => {
    try {
      const quizIds = lessons.map((l) => l.quizId!).filter(Boolean);
      const quizzes = await prisma.quiz.findMany({
        where: { id: { in: quizIds } },
        select: { id: true, title: true },
      });
      const qmap = new Map(quizzes.map((q) => [q.id, q.title]));

      const queue = [...lessons];
      const PARALLEL = 4;
      const worker = async () => {
        for (;;) {
          const l = queue.shift();
          if (!l) return;
          try {
            const a = await analyzeLesson(l.quizId!, group, l.title, qmap.get(l.quizId!));
            const data: { aiModule?: string; aiSeq?: number | null; title?: string } = {};
            if (a.modul) {
              data.aiModule = a.modul;
              data.aiSeq = a.seq;
            }
            if (a.mavzu && a.ishonch >= 85 && a.mavzu !== l.title) {
              data.title = a.mavzu;
            } else if (a.mavzu && a.ishonch < 85 && a.mavzu !== l.title && job.lowConfidence.length < 50) {
              job.lowConfidence.push(l.title);
            }
            if (!a.mavzu && !a.modul) job.failed++;
            if (Object.keys(data).length > 0) {
              await prisma.lessonPlan.update({ where: { id: l.id }, data });
              // Quiz nomi ham yangi nomga tenglashtiriladi (kutubxonada ham tartib bo'lsin)
              if (data.title) {
                await prisma.quiz.update({ where: { id: l.quizId! }, data: { title: data.title } });
                job.renamed++;
              }
            }
          } catch {
            job.failed++;
          }
          job.done++;
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
      await autoReorderGroup(group);
    } catch (e) {
      job.error = e instanceof Error ? e.message : String(e);
    } finally {
      job.running = false;
      job.finishedAt = Date.now();
    }
  })();

  return job;
}

// Ro'yxat — filter bilan (faqat roster'da tasdiqlangan / admin)
curriculumRouter.get("/", requireApproved, async (req, res) => {
  const { subject, ageGroup, year, section } = req.query;
  const where: Record<string, unknown> = {};
  if (subject) where.subject = String(subject);
  if (ageGroup) where.ageGroup = String(ageGroup);
  if (year) where.year = Number(year);
  if (section !== undefined) where.section = section ? String(section) : null;

  const lessons = await prisma.lessonPlan.findMany({
    where,
    orderBy: { order: "asc" },
  });

  // Biriktrilgan quizlar uchun sarlavhalarni olamiz
  const quizIds = lessons.map((l) => l.quizId).filter((id): id is string => Boolean(id));
  const quizzes = quizIds.length
    ? await prisma.quiz.findMany({
        where: { id: { in: quizIds } },
        // folderId + papka nomi — o'quv dasturda darslarni papkasi bo'yicha ranglash uchun
        select: {
          id: true, title: true, folderId: true,
          folder: { select: { name: true } },
          _count: { select: { slides: true } },
        },
      })
    : [];
  const quizMap = new Map(quizzes.map((q) => [q.id, q]));

  res.json({
    lessons: lessons.map((l) => ({
      ...l,
      quiz: l.quizId ? (quizMap.get(l.quizId) ?? null) : null,
    })),
  });
});

// Guruhlangan hisob — filtr tugmalari va tablarда dars sonini ko'rsatish uchun.
// Har (subject, ageGroup, year, section) guruh bo'yicha: jami darslar va
// slayd (quiz) biriktirilganlari soni.
curriculumRouter.get("/counts", requireApproved, async (_req, res) => {
  const [all, withQuiz] = await Promise.all([
    prisma.lessonPlan.groupBy({
      by: ["subject", "ageGroup", "year", "section"],
      _count: { _all: true },
    }),
    prisma.lessonPlan.groupBy({
      by: ["subject", "ageGroup", "year", "section"],
      where: { quizId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const key = (g: { subject: string; ageGroup: string; year: number; section: string | null }) =>
    `${g.subject}|${g.ageGroup}|${g.year}|${g.section ?? ""}`;
  const quizMap = new Map(withQuiz.map((g) => [key(g), g._count._all]));
  res.json({
    groups: all.map((g) => ({
      subject: g.subject,
      ageGroup: g.ageGroup,
      year: g.year,
      section: g.section,
      total: g._count._all,
      withQuiz: quizMap.get(key(g)) ?? 0,
    })),
  });
});

// Bitta quizga biriktirilgan barcha o'quv-reja joylashuvlari (faqat admin).
// Muharrirdagi "Sozlamalar → O'quv rejaga qo'shish" paneli shu orqali joriy
// holatni ko'rsatadi. Bir quiz bir nechta yo'nalish/bo'lim/yilda — har biri
// alohida tartib raqami bilan tura oladi.
curriculumRouter.get("/for-quiz/:quizId", requireAdmin, async (req, res) => {
  const lessons = await prisma.lessonPlan.findMany({
    where: { quizId: String(req.params.quizId) },
    orderBy: [{ subject: "asc" }, { ageGroup: "asc" }, { year: "asc" }, { order: "asc" }],
  });
  res.json({ lessons });
});

// Darslar tartibini qayta joylash (drag&drop) — faqat admin.
// Kelgan `ids` ketma-ketligi bo'yicha har bir darsning `order` maydoni
// 0..n-1 qilib yangilanadi. Bir filtr (yo'nalish/yosh/yil/bo'lim) ichidagi
// darslar ro'yxati yuboriladi.
const reorderSchema = z.object({ ids: z.array(z.string()).min(1) });
curriculumRouter.patch("/reorder", requireAdmin, async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    await prisma.$transaction(
      parsed.data.ids.map((id, i) =>
        prisma.lessonPlan.update({ where: { id }, data: { order: i } }),
      ),
    );
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Tartibni saqlab bo'lmadi" });
  }
});

// Yaratish — faqat admin
curriculumRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = lessonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const lesson = await prisma.lessonPlan.create({
    data: {
      ...parsed.data,
      section: parsed.data.section ?? null,
      quizId: parsed.data.quizId ?? null,
    },
  });
  // Yangi dars o'quv reja bo'yicha avtomatik joyiga tushadi
  await autoReorderGroup({
    subject: lesson.subject, ageGroup: lesson.ageGroup, year: lesson.year, section: lesson.section,
  });
  const fresh = await prisma.lessonPlan.findUnique({ where: { id: lesson.id } });
  res.json({ lesson: fresh ?? lesson });
});

// Ommaviy: PAPKADAN darslar yaratish — faqat admin.
// Tanlangan papkadagi har quizdan bitta dars yaratiladi (quiz avtomatik
// biriktiriladi), kutubxona tartibida (updatedAt desc → 1-dars birinchi).
// Shu bo'limda o'sha quiz allaqachon dars bo'lsa — o'tkazib yuboriladi (dedup).
const fromFolderSchema = z.object({
  subject: z.enum(["ROBOTEXNIKA", "DASTURLASH"]),
  ageGroup: z.enum(["MIDDLE", "SENIOR"]),
  year: z.number().int().min(1).max(4),
  section: z.string().nullable().optional(),
  folderId: z.string().min(1),
  stripPrefix: z.boolean().default(true),
});
curriculumRouter.post("/from-folder", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = fromFolderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const { subject, ageGroup, year, folderId, stripPrefix } = parsed.data;
  const section = subject === "ROBOTEXNIKA" ? (parsed.data.section ?? null) : null;

  // Papka joriy adminniki bo'lishi kerak
  const folder = await prisma.folder.findFirst({ where: { id: folderId, teacherId: req.teacherId } });
  if (!folder) {
    res.status(404).json({ error: "Papka topilmadi" });
    return;
  }
  const rawQuizzes = await prisma.quiz.findMany({
    where: { folderId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true },
  });
  if (rawQuizzes.length === 0) {
    res.status(400).json({ error: "Papkada quiz yo'q" });
    return;
  }
  // O'quv reja bo'yicha tartiblab olamiz (updatedAt tasodifiy tartib edi)
  const group: OrderGroup = { subject, ageGroup, year, section };
  const quizzes = sortLessons(
    rawQuizzes.map((q, i) => ({ ...q, order: i })),
    group,
  );

  // Shu bo'limdagi mavjud darslar: dedup (quizId) + joriy eng katta order
  const existing = await prisma.lessonPlan.findMany({
    where: { subject, ageGroup, year, section },
    select: { order: true, quizId: true },
  });
  const usedQuizIds = new Set(existing.map((e) => e.quizId).filter(Boolean));
  let nextOrder = existing.length ? Math.max(...existing.map((e) => e.order)) + 1 : 0;

  const toCreate = quizzes.filter((q) => !usedQuizIds.has(q.id));
  const skipped = quizzes.length - toCreate.length;

  if (toCreate.length > 0) {
    await prisma.$transaction(
      toCreate.map((q) =>
        prisma.lessonPlan.create({
          data: {
            subject,
            ageGroup,
            year,
            section,
            order: nextOrder++,
            title: stripPrefix ? cleanTitle(q.title) : q.title.trim().slice(0, 200),
            quizId: q.id,
            isDemo: false,
          },
        }),
      ),
    );
    // Butun guruh o'quv reja bo'yicha avtomatik tartibga tushadi
    await autoReorderGroup(group);
    // AI fonda darslarni to'liq o'rganadi (nom + modul + aniq tartib) —
    // import qilingan zahoti avtomatik boshlanadi, kutish shart emas
    void startAiOrganize(group, false);
  }
  res.json({ created: toCreate.length, skipped, aiStarted: toCreate.length > 0 });
});

// Ommaviy: MAVZULAR RO'YXATIDAN darslar qo'shish — faqat admin.
// Har qatorga bitta mavzu; quiz keyinroq biriktiriladi.
const bulkTitlesSchema = z.object({
  subject: z.enum(["ROBOTEXNIKA", "DASTURLASH"]),
  ageGroup: z.enum(["MIDDLE", "SENIOR"]),
  year: z.number().int().min(1).max(4),
  section: z.string().nullable().optional(),
  titles: z.array(z.string()).min(1),
});
curriculumRouter.post("/bulk-titles", requireAdmin, async (req, res) => {
  const parsed = bulkTitlesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const { subject, ageGroup, year } = parsed.data;
  const section = subject === "ROBOTEXNIKA" ? (parsed.data.section ?? null) : null;
  const titles = parsed.data.titles.map((t) => cleanTitle(t)).filter(Boolean);
  if (titles.length === 0) {
    res.status(400).json({ error: "Mavzu topilmadi" });
    return;
  }

  const agg = await prisma.lessonPlan.aggregate({
    where: { subject, ageGroup, year, section },
    _max: { order: true },
  });
  let nextOrder = agg._max.order != null ? agg._max.order + 1 : 0;

  await prisma.$transaction(
    titles.map((title) =>
      prisma.lessonPlan.create({
        data: { subject, ageGroup, year, section, order: nextOrder++, title, isDemo: false },
      }),
    ),
  );
  // Butun guruh o'quv reja bo'yicha avtomatik tartibga tushadi
  await autoReorderGroup({ subject, ageGroup, year, section });
  res.json({ created: titles.length });
});

// AVTOMATIK TARTIBLASH — tanlangan guruhdagi mavjud darslarni o'quv reja
// ketma-ketligi bo'yicha saralaydi (faqat admin). Signal topilmagan darslar
// mavjud tartibda ro'yxat oxirida qoladi.
const autoSortSchema = z.object({
  subject: z.enum(["ROBOTEXNIKA", "DASTURLASH"]),
  ageGroup: z.enum(["MIDDLE", "SENIOR"]),
  year: z.number().int().min(1).max(4),
  section: z.string().nullable().optional(),
});
curriculumRouter.post("/auto-sort", requireAdmin, async (req, res) => {
  const parsed = autoSortSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const { subject, ageGroup, year } = parsed.data;
  const section = subject === "ROBOTEXNIKA" ? (parsed.data.section ?? null) : null;
  const moved = await autoReorderGroup({ subject, ageGroup, year, section });
  res.json({ moved });
});

// MAVZULARNI SLAYDDAN OLISH — tanlangan guruhdagi quiz biriktirilgan darslar
// uchun mavzu nomi quizning BIRINCHI slaydidan o'qiladi (matn elementi bo'lsa
// tekin, aks holda Gemini vision rasmni o'qiydi) va dars nomi yangilanadi.
// O'qib bo'lmagan darslar nomi O'ZGARMAYDI. Faqat admin.
const extractTitlesSchema = z.object({
  subject: z.enum(["ROBOTEXNIKA", "DASTURLASH"]),
  ageGroup: z.enum(["MIDDLE", "SENIOR"]),
  year: z.number().int().min(1).max(4),
  section: z.string().nullable().optional(),
});
// AI TARTIB + NOMLASH — guruhdagi quiz biriktirilgan darslarni fonda AI bilan
// to'liq ishlaydi (slaydlardan nom + modul + ichki o'rin, keyin avto-tartib).
// force=true — allaqachon ishlanganlarni ham qaytadan ko'radi. Faqat admin.
const aiOrganizeSchema = z.object({
  subject: z.enum(["ROBOTEXNIKA", "DASTURLASH"]),
  ageGroup: z.enum(["MIDDLE", "SENIOR"]),
  year: z.number().int().min(1).max(4),
  section: z.string().nullable().optional(),
  force: z.boolean().default(false),
});
curriculumRouter.post("/ai-organize", requireAdmin, async (req, res) => {
  const parsed = aiOrganizeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const { subject, ageGroup, year, force } = parsed.data;
  const section = subject === "ROBOTEXNIKA" ? (parsed.data.section ?? null) : null;
  const result = await startAiOrganize({ subject, ageGroup, year, section }, force);
  if ("alreadyRunning" in result) {
    res.status(409).json({ error: "Bu guruhda AI jarayoni allaqachon ketmoqda" });
    return;
  }
  res.json({ started: true, total: result.total });
});

// AI jarayoni holati — frontend progress ko'rsatish uchun so'rab turadi
curriculumRouter.get("/ai-status", requireAdmin, async (req, res) => {
  const group: OrderGroup = {
    subject: String(req.query.subject ?? ""),
    ageGroup: String(req.query.ageGroup ?? ""),
    year: Number(req.query.year ?? 1),
    section: req.query.section ? String(req.query.section) : null,
  };
  res.json({ job: aiJobs.get(groupKey(group)) ?? null });
});

curriculumRouter.post("/extract-titles", requireAdmin, async (req, res) => {
  const parsed = extractTitlesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const { subject, ageGroup, year } = parsed.data;
  const section = subject === "ROBOTEXNIKA" ? (parsed.data.section ?? null) : null;

  const lessons = await prisma.lessonPlan.findMany({
    where: { subject, ageGroup, year, section, quizId: { not: null } },
    select: { id: true, title: true, quizId: true },
  });
  if (lessons.length === 0) {
    res.json({ updated: 0, unchanged: 0, failed: 0, total: 0 });
    return;
  }

  let updated = 0, unchanged = 0, failed = 0;
  // Gemini tekin rejasini bosmaslik uchun 3 talik guruhlarda parallel ishlaymiz
  const CHUNK = 3;
  for (let i = 0; i < lessons.length; i += CHUNK) {
    await Promise.all(
      lessons.slice(i, i + CHUNK).map(async (l) => {
        try {
          const topic = await extractTopicForQuiz(l.quizId!);
          if (!topic) { failed++; return; }
          if (topic === l.title) { unchanged++; return; }
          await prisma.lessonPlan.update({ where: { id: l.id }, data: { title: topic } });
          updated++;
        } catch {
          failed++;
        }
      }),
    );
  }
  res.json({ updated, unchanged, failed, total: lessons.length });
});

// Yangilash — faqat admin. Tartib raqami o'zgartirilsa dars yangi o'rniga
// KIRITILADI va butun guruh 0..n-1 qilib qayta raqamlanadi — raqamlar har doim
// unik va uzluksiz qoladi (masalan 30-darsni 4 qilsangiz, eski 4..29 bir
// pog'ona pastga suriladi).
curriculumRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = lessonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const id = String(req.params.id);
  const existing = await prisma.lessonPlan.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Dars topilmadi" });
    return;
  }
  const { order: requestedOrder, ...rest } = parsed.data;
  const data = { ...rest, section: parsed.data.section ?? null, quizId: parsed.data.quizId ?? null };

  // Yangi guruhdagi boshqa darslar (tahrirlanayotgan darsdan tashqari)
  const others = await prisma.lessonPlan.findMany({
    where: {
      subject: data.subject, ageGroup: data.ageGroup, year: data.year, section: data.section,
      id: { not: id },
    },
    orderBy: { order: "asc" },
    select: { id: true, order: true },
  });

  // So'ralgan o'ringa kiritamiz (chegaradan chiqsa — boshi/oxiriga)
  const idx = Math.max(0, Math.min(requestedOrder, others.length));
  const seq = [...others.slice(0, idx).map((o) => o.id), id, ...others.slice(idx).map((o) => o.id)];

  await prisma.$transaction([
    prisma.lessonPlan.update({ where: { id }, data }),
    ...seq.map((sid, i) => prisma.lessonPlan.update({ where: { id: sid }, data: { order: i } })),
  ]);

  // Dars boshqa guruhga ko'chirilgan bo'lsa — eski guruhni ham zichlab qayta raqamlaymiz
  const groupChanged =
    existing.subject !== data.subject ||
    existing.ageGroup !== data.ageGroup ||
    existing.year !== data.year ||
    (existing.section ?? null) !== data.section;
  if (groupChanged) {
    await compactGroup({
      subject: existing.subject, ageGroup: existing.ageGroup,
      year: existing.year, section: existing.section,
    });
  }

  const lesson = await prisma.lessonPlan.findUnique({ where: { id } });
  res.json({ lesson });
});

// Darsga quiz biriktirish/yechish — "slayd qilish" ruxsati bo'lgan ustoz ham qila oladi.
// Faqat quizId o'zgaradi (darsning boshqa maydonlariga tegmaydi).
const attachSchema = z.object({ quizId: z.string().nullable() });
curriculumRouter.patch("/:id/quiz", requireCanCreate, async (req, res) => {
  const parsed = attachSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    const lesson = await prisma.lessonPlan.update({
      where: { id: String(req.params.id) },
      data: { quizId: parsed.data.quizId },
    });
    res.json({ lesson });
  } catch {
    res.status(404).json({ error: "Dars topilmadi" });
  }
});

// Ommaviy o'chirish — faqat admin (belgilangan darslar)
curriculumRouter.post("/bulk-delete", requireAdmin, async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(String) : [];
  if (ids.length === 0) {
    res.status(400).json({ error: "ids bo'sh" });
    return;
  }
  // O'chirilayotgan darslarning guruhlarini eslab qolamiz — keyin zichlaymiz
  const doomed = await prisma.lessonPlan.findMany({
    where: { id: { in: ids } },
    select: { subject: true, ageGroup: true, year: true, section: true },
  });
  const r = await prisma.lessonPlan.deleteMany({ where: { id: { in: ids } } });
  const seen = new Set<string>();
  for (const g of doomed) {
    const key = `${g.subject}|${g.ageGroup}|${g.year}|${g.section ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await compactGroup(g);
  }
  res.json({ deleted: r.count });
});

// O'chirish — faqat admin (guruh raqamlari zichlanadi, teshik qolmaydi)
curriculumRouter.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const removed = await prisma.lessonPlan.delete({ where: { id: String(req.params.id) } });
    await compactGroup(removed);
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Dars topilmadi" });
  }
});
