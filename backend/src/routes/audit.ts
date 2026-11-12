import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requireSuperAdmin } from "../auth.js";

// Audit log ko'rish — faqat super admin (ADMIN_EMAILS). Yozuvlar faqat o'qiladi:
// tahrirlash/o'chirish endpointi ATAYLAB yo'q.
export const auditRouter = Router();
auditRouter.use(requireAuth, requireSuperAdmin);

const PAGE = 100;

// GET /api/audit?q=&actor=&action=&entity=&failed=1&from=YYYY-MM-DD&to=YYYY-MM-DD&cursor=<id>
auditRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const actor = String(req.query.actor ?? "").trim();
  const action = String(req.query.action ?? "").trim();
  const entity = String(req.query.entity ?? "").trim();
  const failed = req.query.failed === "1";
  const from = String(req.query.from ?? "").trim();
  const to = String(req.query.to ?? "").trim();
  const cursor = String(req.query.cursor ?? "").trim();

  const and: Prisma.AuditLogWhereInput[] = [];
  if (actor) and.push({ OR: [{ actorEmail: actor }, { actorId: actor }] });
  if (action) and.push({ action: { startsWith: action } });
  if (entity) and.push({ entity });
  if (failed) and.push({ status: { gte: 400 } });
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) and.push({ createdAt: { gte: new Date(`${from}T00:00:00+05:00`) } });
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) and.push({ createdAt: { lte: new Date(`${to}T23:59:59.999+05:00`) } });
  if (q) {
    const c = { contains: q, mode: "insensitive" as const };
    and.push({ OR: [{ summary: c }, { action: c }, { actorEmail: c }, { actorName: c }, { path: c }, { entityId: q }] });
  }

  const rows = await prisma.auditLog.findMany({
    where: and.length ? { AND: and } : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > PAGE;
  const items = hasMore ? rows.slice(0, PAGE) : rows;
  res.json({ items, nextCursor: hasMore ? items[items.length - 1].id : null });
});

// Filtr ro'yxatlari uchun: kim harakat qilgan (oxirgi 90 kun)
auditRouter.get("/actors", async (_req, res) => {
  const since = new Date(Date.now() - 90 * 86400_000);
  const actors = await prisma.auditLog.groupBy({
    by: ["actorEmail", "actorName"],
    where: { createdAt: { gte: since }, actorEmail: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { actorEmail: "desc" } },
    take: 200,
  });
  res.json({
    actors: actors.map((a) => ({ email: a.actorEmail, name: a.actorName, count: a._count._all })),
  });
});
