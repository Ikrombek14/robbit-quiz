import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireCanCreate, type AuthedRequest } from "../auth.js";

export const folderRouter = Router();
folderRouter.use(requireAuth);

// Joriy foydalanuvchi admin'mi? (admin barcha papkalarni ko'radi/boshqaradi)
async function isAdminUser(teacherId?: string): Promise<boolean> {
  if (!teacherId) return false;
  const t = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { isAdmin: true } });
  return t?.isAdmin === true;
}

const nameSchema = z.object({ name: z.string().trim().min(1).max(120) });
// Yaratishda ixtiyoriy ota-papka (ichma-ich papka)
const createSchema = nameSchema.extend({ parentId: z.string().nullable().optional() });

// Ro'yxat — admin barcha papkalarni, oddiy ustoz faqat o'zinikini ko'radi
folderRouter.get("/", async (req: AuthedRequest, res) => {
  const admin = await isAdminUser(req.teacherId);
  const folders = await prisma.folder.findMany({
    where: admin ? {} : { teacherId: req.teacherId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { quizzes: true } },
      teacher: { select: { id: true, name: true } },
    },
  });
  res.json({
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      createdAt: f.createdAt,
      count: f._count.quizzes,
      owner: { id: f.teacher.id, name: f.teacher.name },
      mine: f.teacherId === req.teacherId,
    })),
  });
});

// Yaratish — "slayd qilish" ruxsati kerak. Ixtiyoriy parentId bilan ichma-ich.
folderRouter.post("/", requireCanCreate, async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Papka nomi noto'g'ri" });
    return;
  }
  // Ota-papka ko'rsatilsa — mavjud va ruxsat borligini tekshiramiz
  let parentId: string | null = null;
  if (parsed.data.parentId) {
    const admin = await isAdminUser(req.teacherId);
    const parent = await prisma.folder.findFirst({
      where: admin ? { id: parsed.data.parentId } : { id: parsed.data.parentId, teacherId: req.teacherId },
    });
    if (parent) parentId = parent.id;
  }
  const folder = await prisma.folder.create({
    data: { name: parsed.data.name, teacherId: req.teacherId!, parentId },
    select: { id: true, name: true, parentId: true, createdAt: true },
  });
  res.json({ folder: { ...folder, count: 0, mine: true } });
});

// Papkani boshqa papka ichiga ko'chirish (yoki ildizga chiqarish: parentId=null).
// Sikl (papka o'z avlodi ichiga tushishi) oldini olamiz.
const moveSchema = z.object({ parentId: z.string().nullable() });
folderRouter.patch("/:id/parent", requireCanCreate, async (req: AuthedRequest, res) => {
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ma'lumotlar noto'g'ri" });
    return;
  }
  const id = String(req.params.id);
  const admin = await isAdminUser(req.teacherId);
  const owned = await prisma.folder.findFirst({
    where: admin ? { id } : { id, teacherId: req.teacherId },
  });
  if (!owned) {
    res.status(404).json({ error: "Papka topilmadi" });
    return;
  }
  let newParentId: string | null = null;
  if (parsed.data.parentId) {
    if (parsed.data.parentId === id) {
      res.status(400).json({ error: "Papkani o'z ichiga ko'chirib bo'lmaydi" });
      return;
    }
    const target = await prisma.folder.findFirst({
      where: admin ? { id: parsed.data.parentId } : { id: parsed.data.parentId, teacherId: req.teacherId },
    });
    if (!target) {
      res.status(404).json({ error: "Manzil papka topilmadi" });
      return;
    }
    // Sikl tekshiruvi: nishon papkadan yuqoriga chiqib, joriy papkaga urilsak — rad etamiz
    let cur: string | null = target.parentId;
    let guard = 0;
    while (cur && guard++ < 200) {
      if (cur === id) {
        res.status(400).json({ error: "Papkani o'z ichki papkasiga ko'chirib bo'lmaydi" });
        return;
      }
      const p: { parentId: string | null } | null = await prisma.folder.findUnique({
        where: { id: cur }, select: { parentId: true },
      });
      cur = p?.parentId ?? null;
    }
    newParentId = target.id;
  }
  await prisma.folder.update({ where: { id }, data: { parentId: newParentId } });
  res.json({ ok: true });
});

// Nomini o'zgartirish
folderRouter.patch("/:id", requireCanCreate, async (req: AuthedRequest, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Papka nomi noto'g'ri" });
    return;
  }
  const admin = await isAdminUser(req.teacherId);
  const owned = await prisma.folder.findFirst({
    where: admin ? { id: String(req.params.id) } : { id: String(req.params.id), teacherId: req.teacherId },
  });
  if (!owned) {
    res.status(404).json({ error: "Papka topilmadi" });
    return;
  }
  await prisma.folder.update({ where: { id: owned.id }, data: { name: parsed.data.name } });
  res.json({ ok: true });
});

// O'chirish — papka o'chadi, ichidagi loyihalar saqlanadi (folderId = null)
folderRouter.delete("/:id", requireCanCreate, async (req: AuthedRequest, res) => {
  const admin = await isAdminUser(req.teacherId);
  const owned = await prisma.folder.findFirst({
    where: admin ? { id: String(req.params.id) } : { id: String(req.params.id), teacherId: req.teacherId },
  });
  if (!owned) {
    res.status(404).json({ error: "Papka topilmadi" });
    return;
  }
  await prisma.folder.delete({ where: { id: owned.id } });
  res.json({ ok: true });
});
