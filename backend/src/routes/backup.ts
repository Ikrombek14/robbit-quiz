import { Router } from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import AdmZip from "adm-zip";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "../auth.js";
import { nameKey } from "../lib/nameKey.js";
import { UPLOADS_DIR } from "./upload.js";

// Offline zaxira (backup) va tiklash (restore) — faqat admin.
// Eksport: butun baza bitta strukturali JSON'da (frontend /backup sahifasi shundan
// ZIP yig'adi: data/*.json + uploads/ rasmlar + pdf/ slaydlar + README + manifest).
// Tiklash: o'sha ZIP yuklansa, yo'q yozuvlar qayta yaratiladi (borlari O'ZGARTIRILMAYDI —
// restore hech qachon mavjud ma'lumotni o'chirmaydi/ustidan yozmaydi).
export const backupRouter = Router();
backupRouter.use(requireAuth, requireAdmin);

function parseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

// ---- Eksport: hamma ma'lumot bitta JSON ----
backupRouter.get("/export", async (_req, res) => {
  const [teachers, folders, quizzes, lessonPlans, workshops, extraLessons, practiceTasks, guideSections, roster, gameRecords] = await Promise.all([
    prisma.teacher.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.folder.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.quiz.findMany({
      orderBy: { createdAt: "asc" },
      include: { slides: { orderBy: { order: "asc" } } },
    }),
    prisma.lessonPlan.findMany({ orderBy: [{ subject: "asc" }, { ageGroup: "asc" }, { year: "asc" }, { order: "asc" }] }),
    prisma.workshop.findMany({ orderBy: { order: "asc" } }),
    prisma.extraLesson.findMany({ orderBy: { order: "asc" } }),
    prisma.practiceTask.findMany({ orderBy: { order: "asc" } }),
    prisma.guideSection.findMany({ orderBy: { order: "asc" } }),
    prisma.rosterTeacher.findMany({ orderBy: { order: "asc" } }),
    prisma.gameRecord.findMany({ orderBy: { playedAt: "asc" }, include: { players: true } }),
  ]);

  res.json({
    format: "robbit-quiz-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    site: "robbitquiz.uz",
    counts: {
      teachers: teachers.length,
      folders: folders.length,
      quizzes: quizzes.length,
      slides: quizzes.reduce((s, q) => s + q.slides.length, 0),
      lessonPlans: lessonPlans.length,
      workshops: workshops.length,
      extraLessons: extraLessons.length,
      practiceTasks: practiceTasks.length,
      guideSections: guideSections.length,
      roster: roster.length,
      gameRecords: gameRecords.length,
    },
    // DIQQAT: teachers ichida parol hash'lari bor — ZIP maxfiy saqlanishi kerak
    teachers,
    folders,
    // Slayd data'si DB'da JSON-string — eksportda o'qish oson bo'lishi uchun object qilinadi
    quizzes: quizzes.map((q) => ({
      ...q,
      slides: q.slides.map((s) => ({ ...s, data: parseJson(s.data) })),
    })),
    lessonPlans,
    workshops,
    extraLessons,
    practiceTasks,
    guideSections,
    roster,
    gameRecords,
  });
});

// ---- Tiklash: ZIP qabul qilinadi ----
// Fayl vaqtincha diskka tushadi (katta ZIP xotirani to'ldirmasin)
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, _file, cb) => cb(null, `robbit-restore-${Date.now()}.zip`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
});

// ZIP ichidan data/*.json ni o'qish (buzuq/yo'q bo'lsa null)
function readJsonEntry(zip: AdmZip, name: string): any {
  const entry = zip.getEntry(name);
  if (!entry) return null;
  try {
    return JSON.parse(entry.getData().toString("utf8"));
  } catch {
    return null;
  }
}

backupRouter.post("/restore", upload.single("file"), async (req: AuthedRequest, res) => {
  const filePath = (req as unknown as { file?: { path: string } }).file?.path;
  if (!filePath) {
    res.status(400).json({ error: "ZIP fayl yuborilmadi" });
    return;
  }
  try {
    const zip = new AdmZip(filePath);

    // Backup ikki ko'rinishda bo'lishi mumkin: data/backup.json (hammasi bitta faylda)
    // yoki data/<bo'lim>.json (bo'lingan). Ikkalasini ham qo'llaymiz.
    const whole = readJsonEntry(zip, "data/backup.json");
    const section = (name: string) => whole?.[name] ?? readJsonEntry(zip, `data/${name}.json`) ?? [];
    const fmt = whole?.format ?? readJsonEntry(zip, "manifest.json")?.format;
    if (fmt !== "robbit-quiz-backup") {
      res.status(400).json({ error: "Bu Robbit zaxira ZIP'iga o'xshamaydi (manifest'da format topilmadi)" });
      return;
    }

    const restored: Record<string, number> = {};
    const skipped: Record<string, number> = {};
    const bump = (m: Record<string, number>, k: string, n = 1) => (m[k] = (m[k] ?? 0) + n);

    // 1) uploads/ rasmlar — yo'qlari joyiga yoziladi
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !entry.entryName.startsWith("uploads/")) continue;
      const base = path.basename(entry.entryName); // path traversal'dan himoya
      if (!base) continue;
      const dest = path.join(UPLOADS_DIR, base);
      if (fs.existsSync(dest)) {
        bump(skipped, "uploads");
      } else {
        fs.writeFileSync(dest, entry.getData());
        bump(restored, "uploads");
      }
    }

    // 2) Teachers — id bo'yicha yo'qlari yaratiladi (email band bo'lsa o'tkazib yuboriladi)
    const teachers = section("teachers") as any[];
    const existingTeacherIds = new Set((await prisma.teacher.findMany({ select: { id: true } })).map((t) => t.id));
    const existingEmails = new Set((await prisma.teacher.findMany({ select: { email: true } })).map((t) => t.email.toLowerCase()));
    for (const t of teachers) {
      if (!t?.id || existingTeacherIds.has(t.id) || existingEmails.has(String(t.email ?? "").toLowerCase())) {
        bump(skipped, "teachers");
        continue;
      }
      await prisma.teacher.create({
        data: {
          id: t.id, email: t.email, password: t.password ?? null, name: t.name ?? "?",
          picture: t.picture ?? null, isAdmin: !!t.isAdmin, approved: !!t.approved,
          canCreate: !!t.canCreate, accessOverride: t.accessOverride ?? null,
          createdAt: t.createdAt ? new Date(t.createdAt) : undefined,
        },
      });
      existingTeacherIds.add(t.id);
      existingEmails.add(String(t.email).toLowerCase());
      bump(restored, "teachers");
    }

    // 3) Folders — ikki bosqich: avval parentId'siz yaratamiz, keyin daraxtni tiklaymiz
    const folders = section("folders") as any[];
    const existingFolderIds = new Set((await prisma.folder.findMany({ select: { id: true } })).map((f) => f.id));
    const createdFolders: any[] = [];
    for (const f of folders) {
      if (!f?.id || existingFolderIds.has(f.id)) {
        bump(skipped, "folders");
        continue;
      }
      const teacherId = existingTeacherIds.has(f.teacherId) ? f.teacherId : req.teacherId!;
      await prisma.folder.create({
        data: {
          id: f.id, name: f.name ?? "Papka", teacherId,
          createdAt: f.createdAt ? new Date(f.createdAt) : undefined,
        },
      });
      existingFolderIds.add(f.id);
      createdFolders.push(f);
      bump(restored, "folders");
    }
    for (const f of createdFolders) {
      if (f.parentId && existingFolderIds.has(f.parentId)) {
        await prisma.folder.update({ where: { id: f.id }, data: { parentId: f.parentId } });
      }
    }

    // 4) Quizzes + slides — id bo'yicha yo'qlari yaratiladi (borlariga TEGILMAYDI)
    const quizzes = section("quizzes") as any[];
    const existingQuizIds = new Set((await prisma.quiz.findMany({ select: { id: true } })).map((q) => q.id));
    for (const q of quizzes) {
      if (!q?.id || existingQuizIds.has(q.id)) {
        bump(skipped, "quizzes");
        continue;
      }
      const teacherId = existingTeacherIds.has(q.teacherId) ? q.teacherId : req.teacherId!;
      const folderId = q.folderId && existingFolderIds.has(q.folderId) ? q.folderId : null;
      await prisma.quiz.create({
        data: {
          id: q.id, title: q.title ?? "Loyiha", description: q.description ?? null,
          teacherId, folderId, shuffle: !!q.shuffle, sourceId: q.sourceId ?? null,
          createdAt: q.createdAt ? new Date(q.createdAt) : undefined,
          slides: {
            create: (q.slides ?? []).map((s: any, i: number) => ({
              order: s.order ?? i,
              kind: s.kind ?? "QUESTION",
              type: s.type ?? null,
              // Eksportda data object — DB'ga JSON-string qilib qaytariladi
              data: typeof s.data === "string" ? s.data : JSON.stringify(s.data ?? {}),
              notes: s.notes ?? null,
              timeLimit: s.timeLimit ?? 20,
              points: s.points ?? 1000,
            })),
          },
        },
      });
      existingQuizIds.add(q.id);
      bump(restored, "quizzes");
    }

    // 5) LessonPlans — id bo'yicha
    const lessonPlans = section("lessonPlans") as any[];
    const existingLp = new Set((await prisma.lessonPlan.findMany({ select: { id: true } })).map((l) => l.id));
    for (const l of lessonPlans) {
      if (!l?.id || existingLp.has(l.id)) {
        bump(skipped, "lessonPlans");
        continue;
      }
      await prisma.lessonPlan.create({
        data: {
          id: l.id, subject: l.subject, ageGroup: l.ageGroup, year: l.year ?? 1,
          section: l.section ?? null, order: l.order ?? 0, title: l.title ?? "?",
          author: l.author ?? null, isDemo: !!l.isDemo,
          quizId: l.quizId && existingQuizIds.has(l.quizId) ? l.quizId : null,
          createdAt: l.createdAt ? new Date(l.createdAt) : undefined,
        },
      });
      bump(restored, "lessonPlans");
    }

    // 5b) Workshoplar — id bo'yicha
    const workshops = section("workshops") as any[];
    const existingWs = new Set((await prisma.workshop.findMany({ select: { id: true } })).map((w) => w.id));
    for (const w of workshops) {
      if (!w?.id || existingWs.has(w.id)) {
        bump(skipped, "workshops");
        continue;
      }
      await prisma.workshop.create({
        data: {
          id: w.id, order: w.order ?? 0, title: w.title ?? "?",
          description: w.description ?? null, author: w.author ?? null,
          quizId: w.quizId && existingQuizIds.has(w.quizId) ? w.quizId : null,
          createdAt: w.createdAt ? new Date(w.createdAt) : undefined,
        },
      });
      bump(restored, "workshops");
    }

    // 5c) Qo'shimcha darslar — id bo'yicha
    const extraLessons = section("extraLessons") as any[];
    const existingEx = new Set((await prisma.extraLesson.findMany({ select: { id: true } })).map((e) => e.id));
    for (const e of extraLessons) {
      if (!e?.id || existingEx.has(e.id)) {
        bump(skipped, "extraLessons");
        continue;
      }
      await prisma.extraLesson.create({
        data: {
          id: e.id, order: e.order ?? 0, title: e.title ?? "?",
          description: e.description ?? null, author: e.author ?? null,
          quizId: e.quizId && existingQuizIds.has(e.quizId) ? e.quizId : null,
          createdAt: e.createdAt ? new Date(e.createdAt) : undefined,
        },
      });
      bump(restored, "extraLessons");
    }

    // 5d) Amaliyot vazifalari — id bo'yicha
    const practiceTasks = section("practiceTasks") as any[];
    const existingPt = new Set((await prisma.practiceTask.findMany({ select: { id: true } })).map((p) => p.id));
    for (const p of practiceTasks) {
      if (!p?.id || existingPt.has(p.id)) {
        bump(skipped, "practiceTasks");
        continue;
      }
      await prisma.practiceTask.create({
        data: {
          id: p.id, order: p.order ?? 0, category: p.category ?? "",
          title: p.title ?? "", tasks: p.tasks ?? "", videoUrl: p.videoUrl ?? null,
          imageUrl: p.imageUrl ?? null,
          resources: typeof p.resources === "string" ? p.resources : JSON.stringify(p.resources ?? []),
          createdAt: p.createdAt ? new Date(p.createdAt) : undefined,
        },
      });
      bump(restored, "practiceTasks");
    }

    // 6) GuideSections — id bo'yicha
    const guideSections = section("guideSections") as any[];
    const existingGs = new Set((await prisma.guideSection.findMany({ select: { id: true } })).map((g) => g.id));
    for (const g of guideSections) {
      if (!g?.id || existingGs.has(g.id)) {
        bump(skipped, "guideSections");
        continue;
      }
      await prisma.guideSection.create({
        data: {
          id: g.id, order: g.order ?? 0, title: g.title ?? "?",
          body: g.body ?? "", icon: g.icon ?? null,
          createdAt: g.createdAt ? new Date(g.createdAt) : undefined,
        },
      });
      bump(restored, "guideSections");
    }

    // 7) Roster — nameKey unique, shunga qarab yo'qlari qo'shiladi
    const roster = section("roster") as any[];
    const existingKeys = new Set((await prisma.rosterTeacher.findMany({ select: { nameKey: true } })).map((r) => r.nameKey));
    for (const r of roster) {
      const key = r?.nameKey ?? nameKey(r?.name ?? "");
      if (!key || existingKeys.has(key)) {
        bump(skipped, "roster");
        continue;
      }
      await prisma.rosterTeacher.create({
        data: {
          id: r.id ?? undefined, name: r.name ?? "?", branch: r.branch ?? null,
          category: r.category ?? null, phone: r.phone ?? null, username: r.username ?? null,
          status: r.status ?? null, nameKey: key, order: r.order ?? 0,
        },
      });
      existingKeys.add(key);
      bump(restored, "roster");
    }

    // 8) GameRecords + players — id bo'yicha (hisobotlar tarixi)
    const gameRecords = section("gameRecords") as any[];
    const existingGr = new Set((await prisma.gameRecord.findMany({ select: { id: true } })).map((g) => g.id));
    for (const g of gameRecords) {
      if (!g?.id || existingGr.has(g.id)) {
        bump(skipped, "gameRecords");
        continue;
      }
      await prisma.gameRecord.create({
        data: {
          id: g.id, teacherId: g.teacherId ?? "", quizId: g.quizId ?? "",
          title: g.title ?? "?", pin: g.pin ?? "", mode: g.mode ?? "LIVE",
          totalSlides: g.totalSlides ?? 0,
          questionStats: typeof g.questionStats === "string" ? g.questionStats : JSON.stringify(g.questionStats ?? []),
          playedAt: g.playedAt ? new Date(g.playedAt) : undefined,
          players: {
            create: (g.players ?? []).map((p: any) => ({
              nickname: p.nickname ?? "?", score: p.score ?? 0,
              correctCount: p.correctCount ?? 0, totalAnswered: p.totalAnswered ?? 0,
              details: typeof p.details === "string" ? p.details : JSON.stringify(p.details ?? []),
            })),
          },
        },
      });
      bump(restored, "gameRecords");
    }

    res.json({ ok: true, restored, skipped });
  } finally {
    fs.unlink(filePath, () => {}); // vaqtinchalik ZIP'ni tozalash
  }
});
