import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin } from "../auth.js";
import { nameKey } from "../lib/nameKey.js";
import { resyncAllApproved } from "../lib/approval.js";

export const teachersRouter = Router();
teachersRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Ro'yxat (barcha login ustozlar ko'radi) ----
teachersRouter.get("/", async (_req, res) => {
  const teachers = await prisma.rosterTeacher.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });
  res.json({ teachers });
});

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
teachersRouter.post("/", requireAdmin, async (req, res) => {
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
  await resyncAllApproved();
  res.json({ teacher: t });
});

// ---- Tahrirlash (admin) ----
teachersRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = rosterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ism kerak" });
    return;
  }
  const d = parsed.data;
  try {
    const t = await prisma.rosterTeacher.update({
      where: { id: String(req.params.id) },
      data: {
        name: d.name.trim(), branch: d.branch ?? null, category: d.category ?? null,
        phone: d.phone ?? null, username: d.username ?? null, status: d.status ?? null,
        order: d.order ?? 0, nameKey: nameKey(d.name),
      },
    });
    await resyncAllApproved();
    res.json({ teacher: t });
  } catch {
    res.status(404).json({ error: "Ustoz topilmadi" });
  }
});

// ---- O'chirish (admin) ----
teachersRouter.delete("/:id", requireAdmin, async (req, res) => {
  try {
    await prisma.rosterTeacher.delete({ where: { id: String(req.params.id) } });
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

// ---- CSV import (admin) ----
teachersRouter.post("/import", requireAdmin, upload.single("file"), async (req, res) => {
  const file = (req as any).file as { buffer: Buffer } | undefined;
  if (!file) {
    res.status(400).json({ error: "Fayl yuborilmadi" });
    return;
  }
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

  const cName = findCol(header, "ism-familiya", "ism familiya", "ism");
  const cBranch = findCol(header, "filial");
  const cCat = findCol(header, "toifa");
  const cPhone = findCol(header, "tel");
  const cUser = findCol(header, "username");
  const cStatus = findCol(header, "status");

  if (cName === -1) {
    res.status(400).json({ error: "CSV'da 'Ism-familiya' ustuni topilmadi" });
    return;
  }

  let added = 0, updated = 0, skipped = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const name = String(r[cName] ?? "").trim();
    if (!name) { skipped++; continue; }
    const key = nameKey(name);
    if (!key) { skipped++; continue; }
    const data = {
      name,
      branch: cBranch >= 0 ? String(r[cBranch] ?? "").trim() || null : null,
      category: cCat >= 0 ? String(r[cCat] ?? "").trim() || null : null,
      phone: cPhone >= 0 ? String(r[cPhone] ?? "").trim() || null : null,
      username: cUser >= 0 ? String(r[cUser] ?? "").trim() || null : null,
      status: cStatus >= 0 ? String(r[cStatus] ?? "").trim() || null : null,
      order: i - headerIdx,
      nameKey: key,
    };
    const existing = await prisma.rosterTeacher.findUnique({ where: { nameKey: key } });
    if (existing) {
      await prisma.rosterTeacher.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.rosterTeacher.create({ data });
      added++;
    }
  }

  await resyncAllApproved();
  res.json({ ok: true, summary: { added, updated, skipped } });
});

// ---- CSV export (admin) ----
teachersRouter.get("/export", requireAdmin, async (_req, res) => {
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
