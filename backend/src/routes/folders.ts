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
      createdAt: f.createdAt,
      count: f._count.quizzes,
      owner: { id: f.teacher.id, name: f.teacher.name },
      mine: f.teacherId === req.teacherId,
    })),
  });
});

// Yaratish — "slayd qilish" ruxsati kerak
folderRouter.post("/", requireCanCreate, async (req: AuthedRequest, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Papka nomi noto'g'ri" });
    return;
  }
  const folder = await prisma.folder.create({
    data: { name: parsed.data.name, teacherId: req.teacherId! },
    select: { id: true, name: true, createdAt: true },
  });
  res.json({ folder: { ...folder, count: 0, mine: true } });
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
