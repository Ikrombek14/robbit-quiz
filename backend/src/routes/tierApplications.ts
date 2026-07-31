import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireApproved, requireAdmin, type AuthedRequest } from "../auth.js";
import { getAnalysisByName } from "../services/analysis.js";
import { TIER_REQUIREMENTS, isSubmitWindowOpen } from "../lib/tierRequirements.js";

export const tierApplicationsRouter = Router();
tierApplicationsRouter.use(requireAuth, requireApproved);

async function loadTeacher(teacherId: string) {
  return prisma.teacher.findUnique({ where: { id: teacherId }, select: { id: true, name: true, statsName: true } });
}

// Joriy holat: toifa (Sheets tahlilidan), talablar checklisti, ariza oynasi ochiqmi,
// va hali ko'rib chiqilmagan (PENDING/INTERVIEW) ariza bormi.
tierApplicationsRouter.get("/me", async (req: AuthedRequest, res) => {
  const teacher = await loadTeacher(req.teacherId!);
  if (!teacher) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  let analysis;
  try {
    analysis = await getAnalysisByName(teacher.statsName?.trim() || teacher.name, 3);
  } catch {
    res.status(502).json({ error: "Ko'rsatkichlarni yuklab bo'lmadi, keyinroq urinib ko'ring" });
    return;
  }
  const pending = await prisma.tierApplication.findFirst({
    where: { teacherId: teacher.id, status: { in: ["PENDING", "INTERVIEW"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, toTier: true, status: true, createdAt: true },
  });

  if (!analysis) {
    res.json({ found: false, pending: pending ?? null });
    return;
  }

  const req_ = TIER_REQUIREMENTS[analysis.targetTier] ?? null;
  res.json({
    found: true,
    isExpert: analysis.isExpert,
    fromTier: analysis.currentTier,
    toTier: analysis.targetTier,
    roleName: req_?.roleName ?? null,
    minExperience: req_?.minExperience ?? null,
    kpiChecks: analysis.checks,
    checklist: req_?.checklist ?? [],
    windowOpen: isSubmitWindowOpen(),
    pending: pending ?? null,
  });
});

// Ustozning o'z arizalari tarixi
tierApplicationsRouter.get("/mine", async (req: AuthedRequest, res) => {
  const apps = await prisma.tierApplication.findMany({
    where: { teacherId: req.teacherId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ applications: apps });
});

const submitSchema = z.object({
  note: z.string().trim().max(2000).optional(),
  checklist: z.array(z.object({ key: z.string(), checked: z.boolean() })).default([]),
  certificateIds: z.array(z.string()).default([]),
});

// Ariza topshirish — barcha talablar serverda QAYTA tekshiriladi (client'ga ishonilmaydi).
tierApplicationsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  if (!isSubmitWindowOpen()) {
    res.status(400).json({ error: "Ariza faqat har oyning 1-10 sanalari orasida qabul qilinadi" });
    return;
  }
  const teacher = await loadTeacher(req.teacherId!);
  if (!teacher) {
    res.status(404).json({ error: "Foydalanuvchi topilmadi" });
    return;
  }
  const existing = await prisma.tierApplication.findFirst({
    where: { teacherId: teacher.id, status: { in: ["PENDING", "INTERVIEW"] } },
  });
  if (existing) {
    res.status(409).json({ error: "Sizda hali ko'rib chiqilayotgan ariza mavjud" });
    return;
  }

  let analysis;
  try {
    analysis = await getAnalysisByName(teacher.statsName?.trim() || teacher.name, 3);
  } catch {
    res.status(502).json({ error: "Ko'rsatkichlarni yuklab bo'lmadi, keyinroq urinib ko'ring" });
    return;
  }
  if (!analysis) {
    res.status(400).json({ error: "Statistikada ismingiz topilmadi — admin bilan bog'laning" });
    return;
  }
  if (analysis.isExpert) {
    res.status(400).json({ error: "Siz allaqachon eng yuqori toifadasiz" });
    return;
  }
  // Avtomatik ko'rsatkichlar (uy vazifa/davomat/ketgan/kechikish) HAM barchasi bajarilgan bo'lishi
  // shart — bu qoida ilgari tashqi Google Form havolasida ham shunday edi (faqat passed'da ochilardi).
  if (!analysis.passed) {
    res.status(400).json({ error: "Avtomatik ko'rsatkichlar bo'yicha hali barcha talablar bajarilmagan" });
    return;
  }

  const requirement = TIER_REQUIREMENTS[analysis.targetTier];
  // Talablar ro'yxatidagi barcha bandlar ustoz tomonidan belgilangan (o'z-o'zini tasdiqlash) bo'lishi shart
  const checkedKeys = new Set(parsed.data.checklist.filter((c) => c.checked).map((c) => c.key));
  const missing = (requirement?.checklist ?? []).filter((c) => !checkedKeys.has(c.key));
  if (missing.length > 0) {
    res.status(400).json({ error: "Barcha vazifalarni bajarilgan deb belgilashingiz kerak", missing: missing.map((m) => m.label) });
    return;
  }

  // Sertifikatlar shu ustozga tegishli ekanini tekshiramiz
  const certs = parsed.data.certificateIds.length
    ? await prisma.teacherCertificate.findMany({ where: { id: { in: parsed.data.certificateIds }, teacherId: teacher.id }, select: { id: true } })
    : [];

  const created = await prisma.tierApplication.create({
    data: {
      teacherId: teacher.id,
      fromTier: analysis.currentTier,
      toTier: analysis.targetTier,
      note: parsed.data.note || null,
      checklist: JSON.stringify(
        (requirement?.checklist ?? []).map((c) => ({ key: c.key, label: c.label, checked: checkedKeys.has(c.key) })),
      ),
      certificateIds: JSON.stringify(certs.map((c) => c.id)),
      kpiSnapshot: JSON.stringify(analysis.checks),
    },
  });
  res.json({ application: created });
});

// ---- Admin ----

// Barcha arizalar (eng yangisi birinchi) — sertifikat id'lari to'liq {title,fileUrl} bilan almashtiriladi
tierApplicationsRouter.get("/admin/all", requireAdmin, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const apps = await prisma.tierApplication.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    include: { teacher: { select: { id: true, name: true, email: true, phone: true, picture: true } } },
  });
  const allCertIds = [...new Set(apps.flatMap((a) => JSON.parse(a.certificateIds || "[]") as string[]))];
  const certs = allCertIds.length
    ? await prisma.teacherCertificate.findMany({ where: { id: { in: allCertIds } }, select: { id: true, title: true, fileUrl: true } })
    : [];
  const certMap = new Map(certs.map((c) => [c.id, c]));
  res.json({
    applications: apps.map((a) => ({
      ...a,
      certificates: ((JSON.parse(a.certificateIds || "[]") as string[]).map((id) => certMap.get(id)).filter(Boolean)),
    })),
  });
});

const reviewSchema = z.object({
  status: z.enum(["PENDING", "INTERVIEW", "APPROVED", "REJECTED"]),
  adminNote: z.string().trim().max(2000).nullable().optional(),
});
tierApplicationsRouter.patch("/admin/:id", requireAdmin, async (req: AuthedRequest, res) => {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  try {
    const updated = await prisma.tierApplication.update({
      where: { id: String(req.params.id) },
      data: {
        status: parsed.data.status,
        adminNote: parsed.data.adminNote ?? undefined,
        reviewedAt: new Date(),
        reviewedBy: req.teacherId,
      },
    });
    res.json({ application: updated });
  } catch {
    res.status(404).json({ error: "Ariza topilmadi" });
  }
});
