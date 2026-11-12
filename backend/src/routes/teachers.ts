import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth.js";
import { nameKey } from "../lib/nameKey.js";
import { nameMatch, resolveByName } from "../services/stats.js";
import { auditNote, diffFields } from "../lib/audit.js";
import { resyncAllApproved } from "../lib/approval.js";

export const teachersRouter = Router();
teachersRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Ro'yxat (barcha login ustozlar ko'radi) ----
// Toifa (category) — maxfiy: faqat adminlarga yuboriladi.
// Admin uchun qo'shimcha: har ustozning platformadan foydalanishi (usage) —
// akkaunt ochganmi (ism bo'yicha moslashtiriladi), nechta o'yin/slayd, oxirgi o'yin sanasi.
teachersRouter.get("/", async (req: AuthedRequest, res) => {
  const me = await prisma.teacher.findUnique({ where: { id: req.teacherId }, select: { isAdmin: true } });
  const teachers = await prisma.rosterTeacher.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
  if (!me?.isAdmin) {
    res.json({ teachers: teachers.map(({ category: _category, ...rest }) => rest) });
    return;
  }

  const [accounts, games, quizzes] = await Promise.all([
    prisma.teacher.findMany({ select: { id: true, name: true, email: true, createdAt: true } }),
    prisma.gameRecord.groupBy({ by: ["teacherId"], _count: { _all: true }, _max: { playedAt: true } }),
    prisma.quiz.groupBy({ by: ["teacherId"], _count: { _all: true } }),
  ]);
  const gameMap = new Map(games.map((g) => [g.teacherId, g]));
  const quizMap = new Map(quizzes.map((q) => [q.teacherId, q._count._all]));
  const accByKey = new Map(accounts.map((a) => [nameKey(a.name), a]));

  const usageFor = (r: { name: string; nameKey: string }) => {
    // Avval aniq nameKey mosligi, bo'lmasa fuzzy (ism tartibi / qisqa-to'liq shakl)
    const acc = accByKey.get(r.nameKey) ?? accounts.find((a) => nameMatch(a.name, r.name));
    if (!acc) return null; // akkaunt ochmagan
    const g = gameMap.get(acc.id);
    return {
      email: acc.email,
      registeredAt: acc.createdAt,
      games: g?._count._all ?? 0,
      quizzes: quizMap.get(acc.id) ?? 0,
      lastGameAt: g?._max.playedAt ?? null,
    };
  };

  res.json({ teachers: teachers.map((t) => ({ ...t, usage: usageFor(t) })) });
});

// Audit uchun roster maydonlari
const ROSTER_FIELDS = ["name", "branch", "category", "phone", "username", "status"] as const;
type RosterField = (typeof ROSTER_FIELDS)[number];
type RosterFields = Record<RosterField, string | null>;
const FIELD_LABEL: Record<string, string> = {
  name: "Ism", branch: "Filial", category: "Toifa", phone: "Tel", username: "Username", status: "Status",
};
function pickRoster(t: Partial<RosterFields> | null | undefined): RosterFields | null {
  if (!t) return null;
  return {
    name: t.name ?? null, branch: t.branch ?? null, category: t.category ?? null,
    phone: t.phone ?? null, username: t.username ?? null, status: t.status ?? null,
  };
}

const rosterSchema = z.object({
  name: z.string().min(1),
  branch: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  order: z.number().int().optional(),
});

// ---- Qo'shish (admin) ----
teachersRouter.post("/", requireSuperAdmin, async (req, res) => {
  const parsed = rosterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ism kerak" });
    return;
  }
  const d = parsed.data;
  const key = nameKey(d.name);
  const exists = await prisma.rosterTeacher.findUnique({ where: { nameKey: key } });
  if (exists) {
    res.status(409).json({ error: "Bu ism allaqachon ro'yxatda bor" });
    return;
  }
  const t = await prisma.rosterTeacher.create({
    data: {
      name: d.name.trim(), branch: d.branch ?? null, category: d.category ?? null,
      phone: d.phone ?? null, username: d.username ?? null, status: d.status ?? null,
      order: d.order ?? 0, nameKey: key,
    },
  });
  auditNote(res, {
    action: "roster.create", entity: "RosterTeacher", entityId: t.id,
    summary: `Ro'yxatga qo'shildi: ${t.name}${t.branch ? ` (${t.branch})` : ""}`,
    details: { after: pickRoster(t) },
  });
  await resyncAllApproved();
  res.json({ teacher: t });
});

// ---- Tahrirlash (admin) ----
teachersRouter.put("/:id", requireSuperAdmin, async (req, res) => {
  const parsed = rosterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ism kerak" });
    return;
  }
  const d = parsed.data;
  const before = await prisma.rosterTeacher.findUnique({ where: { id: String(req.params.id) } });
  try {
    const t = await prisma.rosterTeacher.update({
      where: { id: String(req.params.id) },
      data: {
        name: d.name.trim(), branch: d.branch ?? null, category: d.category ?? null,
        phone: d.phone ?? null, username: d.username ?? null, status: d.status ?? null,
        // order formada yuborilmaydi — yuborilmasa eskisi qoladi (avval 0 ga tushib, ro'yxat boshiga sakrardi)
        order: d.order ?? before?.order ?? 0, nameKey: nameKey(d.name),
      },
    });
    const changes = diffFields(pickRoster(before), pickRoster(t), [...ROSTER_FIELDS]);
    auditNote(res, {
      action: "roster.update", entity: "RosterTeacher", entityId: t.id,
      summary: `Tahrirlandi: ${t.name}` + (Object.keys(changes).length
        ? " — " + Object.entries(changes).map(([f, [a, b]]) => `${FIELD_LABEL[f] ?? f}: ${a ?? "—"} → ${b ?? "—"}`).join("; ")
        : " (o'zgarish yo'q)"),
      details: { changes },
    });
    await resyncAllApproved();
    res.json({ teacher: t });
  } catch {
    res.status(404).json({ error: "Ustoz topilmadi" });
  }
});

// ---- O'chirish (admin) ----
teachersRouter.delete("/:id", requireSuperAdmin, async (req, res) => {
  try {
    const t = await prisma.rosterTeacher.delete({ where: { id: String(req.params.id) } });
    auditNote(res, {
      action: "roster.delete", entity: "RosterTeacher", entityId: t.id,
      summary: `Ro'yxatdan o'chirildi: ${t.name}${t.branch ? ` (${t.branch})` : ""}`,
      details: { before: pickRoster(t) },
    });
    await resyncAllApproved();
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Ustoz topilmadi" });
  }
});

// CSV ustun sarlavhalarini moslashtirish
function findCol(header: any[], ...needles: string[]): number {
  return header.findIndex((c) => {
    const s = String(c ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    return needles.some((n) => s.includes(n));
  });
}

// ---- CSV / XLSX import (admin) ----
// Xavfsiz import (bir marta noto'g'ri fayl butun ro'yxat filiallarini aralashtirib yuborgan):
//  - ?dryRun=1 — hech narsa yozilmaydi, faqat nima o'zgarishi qaytadi (UI tasdiqlatadi).
//  - ?mode=branch — mavjud ustozlarda FAQAT filial yangilanadi (toifa/tel/status tegilmaydi).
//    mode=full (default) — fayldagi barcha ustunlar yangilanadi.
//  - Faylda bo'lmagan ustun yoki BO'SH katak mavjud qiymatni o'chirmaydi.
//  - Ism aniq mos kelmasa — YAGONA yumshoq moslik (o'/g' imlosi, ism tartibi, Ikrom~Ikromjon)
//    qidiriladi, shunda bitta ustoz ikkinchi marta qo'shilib ketmaydi. Preview'da belgilanadi.
//  - Ro'yxatdagi, lekin faylda yo'q ustozlar O'CHIRILMAYDI — faqat ro'yxati qaytadi.
//  - Barcha o'zgarishlar audit log'ga yoziladi (oldin → keyin).
type ImportChange = {
  row: number; // Excel'dagi qator raqami
  fileName: string;
  rosterName?: string; // mos kelgan ro'yxatdagi ism (yangi bo'lsa yo'q)
  type: "new" | "update";
  fuzzy?: boolean; // ism aniq emas, yumshoq moslik bilan topildi
  fields: Record<string, [string | null, string | null]>;
};

teachersRouter.post("/import", requireSuperAdmin, upload.single("file"), async (req, res) => {
  const file = (req as any).file as { buffer: Buffer; originalname?: string } | undefined;
  if (!file) {
    res.status(400).json({ error: "Fayl yuborilmadi" });
    return;
  }
  const dryRun = req.query.dryRun === "1";
  const mode: "full" | "branch" = req.query.mode === "branch" ? "branch" : "full";

  let rows: any[][];
  try {
    const wb = XLSX.read(file.buffer, { type: "buffer", raw: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false, defval: "" });
  } catch {
    res.status(400).json({ error: "Faylni o'qib bo'lmadi" });
    return;
  }

  // Sarlavha qatorini topamiz (ism-familiya bo'lgan qator)
  let headerIdx = rows.findIndex((r) => r.some((c) => /ism.?familiya/i.test(String(c ?? ""))));
  if (headerIdx === -1) headerIdx = 0;
  const header = rows[headerIdx] ?? [];

  const cols: Record<RosterField, number> = {
    name: findCol(header, "ism-familiya", "ism familiya", "ism"),
    branch: findCol(header, "filial"),
    category: findCol(header, "toifa"),
    phone: findCol(header, "tel"),
    username: findCol(header, "username"),
    status: findCol(header, "status"),
  };

  if (cols.name === -1) {
    res.status(400).json({ error: "Faylda 'Ism-familiya' ustuni topilmadi" });
    return;
  }
  if (mode === "branch" && cols.branch === -1) {
    res.status(400).json({ error: "Faylda 'Filial' ustuni topilmadi" });
    return;
  }

  const roster = await prisma.rosterTeacher.findMany();
  const claimed = new Map<string, number>(); // rosterId (yoki new:<key>) -> fayl qatori
  const changes: ImportChange[] = [];
  const warnings: string[] = [];
  const writes: Array<{ id?: string; data: any }> = [];
  let unchanged = 0, skipped = 0;

  const cell = (r: any[], c: number): string | null => (c >= 0 ? String(r[c] ?? "").trim() || null : null);

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const rowNo = i + 1;
    const name = String(r[cols.name] ?? "").trim().replace(/\s+/g, " ");
    const key = nameKey(name);
    if (!name || !key) { skipped++; continue; }

    let existing = roster.find((t) => t.nameKey === key) ?? null;
    let fuzzy = false;
    if (!existing) {
      existing = resolveByName(roster, name);
      fuzzy = !!existing;
    }

    if (existing) {
      const prevRow = claimed.get(existing.id);
      if (prevRow) {
        warnings.push(`${rowNo}-qator "${name}" — ${prevRow}-qator bilan bir xil ustozga ("${existing.name}") tushdi, o'tkazib yuborildi`);
        skipped++;
        continue;
      }
      claimed.set(existing.id, rowNo);

      // branch rejimida faqat filial; bo'sh katak — tegilmaydi
      const fields: RosterField[] = mode === "branch" ? ["branch"] : ["branch", "category", "phone", "username", "status"];
      const data: Record<string, string> = {};
      const diff: Record<string, [string | null, string | null]> = {};
      for (const f of fields) {
        const v = cell(r, cols[f]);
        if (v == null) continue;
        const old = (existing[f] as string | null) ?? null;
        if (old !== v) { data[f] = v; diff[f] = [old, v]; }
      }
      if (Object.keys(diff).length === 0) { unchanged++; continue; }
      changes.push({ row: rowNo, fileName: name, rosterName: existing.name, type: "update", fuzzy, fields: diff });
      writes.push({ id: existing.id, data });
    } else {
      const newKey = `new:${key}`;
      const prevRow = claimed.get(newKey);
      if (prevRow) {
        warnings.push(`${rowNo}-qator "${name}" faylda takrorlangan (${prevRow}-qator), o'tkazib yuborildi`);
        skipped++;
        continue;
      }
      claimed.set(newKey, rowNo);
      const data = {
        name,
        branch: cell(r, cols.branch),
        category: cell(r, cols.category),
        phone: cell(r, cols.phone),
        username: cell(r, cols.username),
        status: cell(r, cols.status),
        order: roster.length + writes.length + 1, // ro'yxat oxiriga
        nameKey: key,
      };
      const diff: Record<string, [string | null, string | null]> = {};
      for (const f of ROSTER_FIELDS) if (data[f]) diff[f] = [null, data[f]];
      changes.push({ row: rowNo, fileName: name, type: "new", fields: diff });
      writes.push({ data });
    }
  }

  // Ro'yxatda bor, lekin faylda yo'q — o'chirilmaydi, faqat ma'lumot uchun
  const missing = roster.filter((t) => !claimed.has(t.id)).map((t) => ({ name: t.name, branch: t.branch }));

  const summary = {
    added: changes.filter((c) => c.type === "new").length,
    updated: changes.filter((c) => c.type === "update").length,
    unchanged,
    skipped,
  };

  if (dryRun) {
    res.json({ ok: true, dryRun: true, mode, summary, changes, warnings, missing });
    return;
  }

  // Hammasi yoki hech biri — yarim yo'lda xato bo'lsa ro'yxat aralash holda qolmasin
  await prisma.$transaction(
    writes.map((w) => (w.id
      ? prisma.rosterTeacher.update({ where: { id: w.id }, data: w.data })
      : prisma.rosterTeacher.create({ data: w.data }))),
  );

  auditNote(res, {
    action: "roster.import",
    entity: "RosterTeacher",
    summary: `Import (${mode === "branch" ? "faqat filial" : "to'liq"}, ${file.originalname ?? "fayl"}): ` +
      `${summary.added} yangi, ${summary.updated} yangilandi, ${summary.unchanged} o'zgarishsiz`,
    details: { mode, file: file.originalname ?? null, summary, changes, warnings },
  });

  await resyncAllApproved();
  res.json({ ok: true, mode, summary, changes, warnings, missing });
});

// ---- CSV export (admin) ----
teachersRouter.get("/export", requireSuperAdmin, async (_req, res) => {
  const teachers = await prisma.rosterTeacher.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
  const esc = (v: any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Ism-familiya", "Filial", "Toifa", "Tel", "Username", "Status"];
  const lines = [header.join(",")];
  for (const t of teachers) {
    lines.push([t.name, t.branch, t.category, t.phone, t.username, t.status].map(esc).join(","));
  }
  const csv = "﻿" + lines.join("\r\n"); // BOM — Excel UTF-8 uchun
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="ustozlar.csv"');
  res.send(csv);
});
