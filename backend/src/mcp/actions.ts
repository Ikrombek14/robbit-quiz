import { prisma } from "../prisma.js";
import { writeAuditEvent } from "../lib/audit.js";
import { quizAccess } from "../lib/quizAccess.js";
import { isQuizInLiveGame } from "../socket/game.js";
import { localizeSlideImages } from "../services/externalImages.js";
import {
  writeQuiz,
  insertSlide,
  updateSlideRow,
  createQuizWithSlides,
  reorderSlides,
  VersionConflictError,
  QuizNotFoundError,
} from "../lib/quizWrite.js";
import { applyItemOps, changeType, type ItemOp, type TypeExtra } from "../lib/slideItems.js";
import {
  TYPE_LABELS,
  type QType,
  buildSlide,
  applyChanges,
  describeSlide,
  SlideValidationError,
  LIMITS,
  type BuiltSlide,
  type SlideInput,
  type SlideChanges,
  type FieldDiff,
} from "../lib/slideValidate.js";
import { McpToolError, type McpContext, type McpUser } from "./context.js";
import { randomToken, sha256, maskToken } from "./security.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ---- Majburiy tasdiq: har bir yozuvchi amal ikki bosqichda ----
// 1) Taklif: kirish, huquq va TO'LIQ validatsiya tekshiriladi, HECH NARSA saqlanmaydi —
//    McpPendingAction yoziladi, foydalanuvchiga oldindan ko'rinish qaytadi.
// 2) confirm_action({ actionId }) — faqat shu ustoz + shu OAuth ruxsat (grant), bir marta,
//    muddati ichida. Huquq, quiz versiyasi va uy vazifa bloki QAYTA tekshiriladi.
// Parametrlar serverda saqlanadi: tasdiqda ularni o'zgartirib bo'lmaydi.

export const ACTION_TTL_MS = 10 * 60 * 1000;
export const MAX_PENDING = 20;

export type ActionTool = "create_quiz" | "add_slide" | "update_slide" | "edit_slide_items" | "change_slide_type" | "reorder_slides";

// Bitta slaydni o'zgartiradigan amallar: tasdiqda yangi holat saqlangan parametrlardan QAYTA
// hisoblanadi (versiya o'zgarmagani uchun natija taklifdagi bilan aynan bir xil bo'ladi).
type SlideTool = "update_slide" | "edit_slide_items" | "change_slide_type";
function computeSlide(tool: SlideTool, current: BuiltSlide, p: any): BuiltSlide {
  if (tool === "update_slide") return applyChanges(current, p.changes).slide;
  if (tool === "edit_slide_items") return applyItemOps(current, p.operations, p.text).slide;
  return changeType(current, p.newType, p.extra ?? {}).slide;
}

export const CONFLICT_MESSAGE =
  "Quiz siz tasdiqlaguningizcha boshqa joyda o'zgartirildi, avval get_quiz bilan yangisini o'qing.";

// ---------- Oddiy xotiradagi tezlik chegarasi (grant boshiga) ----------
const buckets = new Map<string, number[]>();
export function writeRateLimited(key: string, max = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    buckets.set(key, arr);
    return true;
  }
  arr.push(now);
  buckets.set(key, arr);
  return false;
}

async function clientName(clientId: string): Promise<string> {
  const c = await prisma.oAuthClient.findUnique({ where: { id: clientId }, select: { name: true } });
  return c?.name ?? "MCP ilova";
}

function audit(ctx: McpContext, action: string, a: { quizId?: string | null; actionId: string; tool: string; summary: string; status?: number; details?: Record<string, unknown> }) {
  void clientName(ctx.clientId).then((client) =>
    writeAuditEvent({
      actorId: ctx.teacherId,
      action,
      method: "MCP",
      path: `/mcp/${a.tool}`,
      status: a.status ?? 200,
      entity: a.quizId ? "Quiz" : undefined,
      entityId: a.quizId ?? undefined,
      summary: a.summary,
      details: { source: "mcp", client, actionId: maskToken(a.actionId), tool: a.tool, ...(a.details ?? {}) },
    }),
  );
}

function wrapValidation<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof SlideValidationError) throw new McpToolError(`Ma'lumot noto'g'ri:\n- ${e.errors.join("\n- ")}`);
    throw e;
  }
}

async function editableQuiz(me: McpUser, quizId: string, quizVersion: number) {
  const access = await quizAccess(me.id, quizId);
  if (!access?.view) throw new McpToolError("Quiz topilmadi yoki uni ko'rish huquqingiz yo'q.");
  if (!access.edit) throw new McpToolError("Bu quizni tahrirlash huquqingiz yo'q.");
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId }, select: { id: true, title: true, version: true, _count: { select: { slides: true } } } });
  if (!quiz) throw new McpToolError("Quiz topilmadi.");
  if (quiz.version !== quizVersion) {
    throw new McpToolError(`Quiz versiyasi o'zgargan (siz bergan: ${quizVersion}, hozirgi: ${quiz.version}). Avval get_quiz bilan yangisini o'qing.`);
  }
  return quiz;
}

function liveWarning(quizId: string): string | null {
  return isQuizInLiveGame(quizId) ? "⚠️ Bu quiz hozir darsda ishlatilmoqda — o'zgarish keyingi darsdan boshlab ko'rinadi." : null;
}

// ---------- Taklif ----------
interface ProposalCore {
  tool: ActionTool;
  params: Record<string, unknown>;
  quizId: string | null;
  quizVersion: number | null;
  summary: string;
  preview: string;
  diff: unknown;
  warnings: string[];
}

async function savePending(ctx: McpContext, p: ProposalCore) {
  // Muddati o'tganlarni avval yopamiz — limit ular bilan to'lmasin
  await expireStale(ctx.teacherId);
  const pending = await prisma.mcpPendingAction.count({ where: { teacherId: ctx.teacherId, status: "PENDING" } });
  if (pending >= MAX_PENDING) {
    throw new McpToolError(`Tasdiq kutayotgan amallar juda ko'p (${pending}). Avvalgilarini tasdiqlang yoki cancel_action bilan bekor qiling.`);
  }
  const actionId = randomToken("rqx");
  const expiresAt = new Date(Date.now() + ACTION_TTL_MS);
  await prisma.mcpPendingAction.create({
    data: {
      actionHash: sha256(actionId),
      teacherId: ctx.teacherId,
      grantId: ctx.grantId,
      clientId: ctx.clientId,
      tool: p.tool,
      params: p.params as object,
      quizId: p.quizId,
      quizVersion: p.quizVersion,
      summary: p.summary.slice(0, 500),
      preview: p.preview.slice(0, 20_000),
      expiresAt,
    },
  });
  audit(ctx, "mcp.action.propose", { quizId: p.quizId, actionId, tool: p.tool, summary: `Taklif: ${p.summary}`, details: { diff: p.diff } });
  return {
    status: "confirmation_required",
    actionId,
    expiresAt: expiresAt.toISOString(),
    summary: p.summary,
    preview: [p.preview, ...p.warnings].join("\n\n"),
    diff: p.diff,
    nextStep:
      "HECH NARSA SAQLANMADI. Yuqoridagi preview'ni foydalanuvchiga o'zbek tilida to'liq ko'rsating va " +
      "aniq roziligini so'rang. Faqat foydalanuvchi rozi bo'lsa confirm_action({ actionId }) ni chaqiring; " +
      "rad etsa cancel_action({ actionId }). Amal 10 daqiqada o'z-o'zidan bekor bo'ladi.",
  };
}

export async function proposeCreateQuiz(
  ctx: McpContext,
  me: McpUser,
  args: { title: string; description?: string; folderId?: string; slides?: SlideInput[] },
) {
  const title = args.title.replace(/<[^>]*>/g, "").trim().slice(0, 200);
  if (!title) throw new McpToolError("Quiz nomi bo'sh bo'lmasligi kerak.");
  const slidesIn = args.slides ?? [];
  if (slidesIn.length > LIMITS.maxSlidesPerCreate) throw new McpToolError(`Bir yo'la ko'pi bilan ${LIMITS.maxSlidesPerCreate} ta slayd.`);
  let folderName = "Kutubxona (papkasiz)";
  if (args.folderId) {
    const f = await prisma.folder.findFirst({ where: me.isAdmin ? { id: args.folderId } : { id: args.folderId, teacherId: me.id }, select: { name: true } });
    if (!f) throw new McpToolError("Papka topilmadi (list_folders bilan tekshiring).");
    folderName = f.name;
  }
  const built = slidesIn.map((s, i) =>
    wrapValidation(() => {
      try {
        return buildSlide(s);
      } catch (e) {
        if (e instanceof SlideValidationError) throw new SlideValidationError(e.errors.map((m) => `${i + 1}-slayd: ${m}`));
        throw e;
      }
    }),
  );
  const lines = [`Yangi quiz yaratiladi: «${title}»`, `Papka: ${folderName}`, `Slaydlar soni: ${built.length}`];
  built.forEach((s, i) => lines.push(`\n${i + 1}. ${describeSlide(s)}`));
  return savePending(ctx, {
    tool: "create_quiz",
    params: { title, description: args.description?.replace(/<[^>]*>/g, "").trim().slice(0, 1000) || null, folderId: args.folderId ?? null, slides: built },
    quizId: null,
    quizVersion: null,
    summary: `Yangi quiz «${title}» (${built.length} ta slayd)`,
    preview: lines.join("\n"),
    diff: { create: { title, folder: folderName, slides: built.length } },
    warnings: [],
  });
}

export async function proposeAddSlide(
  ctx: McpContext,
  me: McpUser,
  args: { quizId: string; quizVersion: number; slide: SlideInput; position?: number },
) {
  const quiz = await editableQuiz(me, args.quizId, args.quizVersion);
  if (quiz._count.slides >= LIMITS.maxSlidesPerQuiz) throw new McpToolError(`Quizda ko'pi bilan ${LIMITS.maxSlidesPerQuiz} ta slayd bo'lishi mumkin.`);
  const built = wrapValidation(() => buildSlide(args.slide));
  const n = quiz._count.slides;
  const pos = args.position === undefined ? n + 1 : Math.min(Math.max(args.position, 1), n + 1);
  const where = pos === 1 ? "boshiga (1-o'rin)" : pos === n + 1 ? `oxiriga (${pos}-o'rin)` : `${pos - 1}-slayddan keyin (${pos}-o'rin)`;
  const w = liveWarning(quiz.id);
  return savePending(ctx, {
    tool: "add_slide",
    params: { quizId: quiz.id, position: pos, slide: built },
    quizId: quiz.id,
    quizVersion: quiz.version,
    summary: `«${quiz.title}» quiziga slayd qo'shish (${pos}-o'rin)`,
    preview: [`Quiz: «${quiz.title}»`, `Joyi: ${where}`, describeSlide(built)].join("\n"),
    diff: { add: { position: pos, slide: built } },
    warnings: w ? [w] : [],
  });
}

function slideRowToBuilt(s: { kind: string; type: string | null; data: string; notes: string | null; timeLimit: number; points: number }): BuiltSlide {
  let data: any = {};
  try {
    data = JSON.parse(s.data);
  } catch {
    data = {};
  }
  return { kind: s.kind as BuiltSlide["kind"], type: (s.type as BuiltSlide["type"]) ?? null, data, notes: s.notes, timeLimit: s.timeLimit, points: s.points };
}

export async function proposeUpdateSlide(
  ctx: McpContext,
  me: McpUser,
  args: { quizId: string; quizVersion: number; slideId: string; changes: SlideChanges },
) {
  const quiz = await editableQuiz(me, args.quizId, args.quizVersion);
  const slides = await prisma.slide.findMany({ where: { quizId: quiz.id }, orderBy: { order: "asc" } });
  const idx = slides.findIndex((s) => s.id === args.slideId);
  if (idx < 0) throw new McpToolError("Slayd topilmadi — get_quiz bilan yangi ro'yxatni oling.");
  const { diff } = wrapValidation(() => applyChanges(slideRowToBuilt(slides[idx]), args.changes));
  const w = liveWarning(quiz.id);
  const lines = [`Quiz: «${quiz.title}», ${idx + 1}-slayd`, "O'zgaradi:"];
  for (const d of diff) lines.push(`• ${d.label}: ${d.before} → ${d.after}`);
  return savePending(ctx, {
    tool: "update_slide",
    params: { quizId: quiz.id, slideId: args.slideId, changes: args.changes },
    quizId: quiz.id,
    quizVersion: quiz.version,
    summary: `«${quiz.title}» quizining ${idx + 1}-slaydini tahrirlash (${diff.map((d) => d.label).join(", ")})`,
    preview: lines.join("\n"),
    diff: diff satisfies FieldDiff[],
    warnings: w ? [w] : [],
  });
}

async function slideOf(quizId: string, slideId: string) {
  const slides = await prisma.slide.findMany({ where: { quizId }, orderBy: { order: "asc" } });
  const idx = slides.findIndex((s) => s.id === slideId);
  if (idx < 0) throw new McpToolError("Slayd topilmadi — get_quiz bilan yangi ro'yxatni oling.");
  return { idx, row: slides[idx] };
}

export async function proposeEditItems(
  ctx: McpContext,
  me: McpUser,
  args: { quizId: string; quizVersion: number; slideId: string; operations: ItemOp[]; text?: string },
) {
  const quiz = await editableQuiz(me, args.quizId, args.quizVersion);
  const { idx, row } = await slideOf(quiz.id, args.slideId);
  const r = wrapValidation(() => applyItemOps(slideRowToBuilt(row), args.operations, args.text));
  const w = liveWarning(quiz.id);
  const preview = [
    `Quiz: «${quiz.title}», ${idx + 1}-slayd`,
    "Amallar:",
    ...r.lines.map((l) => `• ${l}`),
    "",
    "Oldin:",
    ...r.before.map((l) => `  ${l}`),
    "Keyin:",
    ...r.after.map((l) => `  ${l}`),
  ].join("\n");
  return savePending(ctx, {
    tool: "edit_slide_items",
    params: { quizId: quiz.id, slideId: args.slideId, operations: args.operations, text: args.text },
    quizId: quiz.id,
    quizVersion: quiz.version,
    summary: `«${quiz.title}» quizining ${idx + 1}-slaydida ${args.operations.length} ta element amali`,
    preview,
    diff: { operations: r.lines, before: r.before, after: r.after },
    warnings: w ? [w] : [],
  });
}

export async function proposeChangeType(
  ctx: McpContext,
  me: McpUser,
  args: { quizId: string; quizVersion: number; slideId: string; newType: QType; extra?: TypeExtra },
) {
  const quiz = await editableQuiz(me, args.quizId, args.quizVersion);
  const { idx, row } = await slideOf(quiz.id, args.slideId);
  const current = slideRowToBuilt(row);
  const r = wrapValidation(() => changeType(current, args.newType, args.extra ?? {}));
  const w = liveWarning(quiz.id);
  const from = current.type ? `${TYPE_LABELS[current.type as QType]} (${current.type})` : "?";
  const to = `${TYPE_LABELS[args.newType]} (${args.newType})`;
  const preview = [
    `Quiz: «${quiz.title}», ${idx + 1}-slayd`,
    `Tur: ${from} → ${to}`,
    `✅ Saqlanadi: ${r.kept.join(", ")}`,
    r.lost.length ? `❌ YO'QOLADI: ${r.lost.join(", ")}` : "❌ Yo'qoladigan ma'lumot yo'q",
    "",
    "Natija:",
    describeSlide(r.slide),
  ].join("\n");
  return savePending(ctx, {
    tool: "change_slide_type",
    params: { quizId: quiz.id, slideId: args.slideId, newType: args.newType, extra: args.extra ?? {} },
    quizId: quiz.id,
    quizVersion: quiz.version,
    summary: `«${quiz.title}» quizining ${idx + 1}-slayd turi: ${current.type} → ${args.newType}`,
    preview,
    diff: { fromType: current.type, toType: args.newType, kept: r.kept, lost: r.lost },
    warnings: w ? [w] : [],
  });
}

function headline(row: { kind: string; data: string }): string {
  try {
    const d = JSON.parse(row.data);
    if (row.kind === "QUESTION") return String(d.text ?? "").slice(0, 60) || "(savol)";
    const t = Array.isArray(d.elements) ? d.elements.find((e: any) => e?.type === "text")?.text : d.title;
    return String(t ?? "").slice(0, 60) || "(kontent slayd)";
  } catch {
    return "(slayd)";
  }
}

export async function proposeReorder(
  ctx: McpContext,
  me: McpUser,
  args: { quizId: string; quizVersion: number; slideId?: string; position?: number; order?: string[] },
) {
  const quiz = await editableQuiz(me, args.quizId, args.quizVersion);
  const rows = await prisma.slide.findMany({ where: { quizId: quiz.id }, orderBy: { order: "asc" }, select: { id: true, kind: true, data: true } });
  const ids = rows.map((r) => r.id);
  let next: string[];
  if (args.order) {
    if (args.slideId || args.position !== undefined) throw new McpToolError("order bilan birga slideId/position berilmaydi — bittasini tanlang.");
    const set = new Set(args.order);
    const missing = ids.filter((id) => !set.has(id));
    const unknown = args.order.filter((id) => !ids.includes(id));
    if (set.size !== args.order.length) throw new McpToolError("order'da takrorlangan slayd bor.");
    if (missing.length || unknown.length) {
      throw new McpToolError(
        `order quizdagi BARCHA slaydlarni aynan bir martadan sanashi kerak (${ids.length} ta).` +
          (missing.length ? ` Yetishmaydi: ${missing.length} ta.` : "") + (unknown.length ? ` Noma'lum id: ${unknown.join(", ")}.` : ""),
      );
    }
    next = args.order;
  } else {
    if (!args.slideId || args.position === undefined) throw new McpToolError("slideId + position yoki to'liq order bering.");
    const from = ids.indexOf(args.slideId);
    if (from < 0) throw new McpToolError("Slayd topilmadi — get_quiz bilan yangi ro'yxatni oling.");
    next = [...ids];
    next.splice(from, 1);
    next.splice(Math.min(Math.max(args.position - 1, 0), next.length), 0, args.slideId);
  }
  const moved = next.map((id, i) => ({ id, from: ids.indexOf(id) + 1, to: i + 1 })).filter((m) => m.from !== m.to);
  if (moved.length === 0) throw new McpToolError("Tartib o'zgarmaydi — hozirgi tartib bilan bir xil.");
  const byId = new Map(rows.map((r) => [r.id, r]));
  const w = liveWarning(quiz.id);
  const preview = [
    `Quiz: «${quiz.title}» — slaydlar tartibi`,
    "O'rni o'zgaradiganlar:",
    ...moved.map((m) => `• «${headline(byId.get(m.id)!)}»: ${m.from} → ${m.to}`),
  ].join("\n");
  return savePending(ctx, {
    tool: "reorder_slides",
    params: { quizId: quiz.id, order: next },
    quizId: quiz.id,
    quizVersion: quiz.version,
    summary: `«${quiz.title}» quizida ${moved.length} ta slayd o'rni o'zgaradi`,
    preview,
    diff: { moved },
    warnings: w ? [w] : [],
  });
}

// ---------- Tasdiq / bekor qilish ----------
async function expireStale(teacherId?: string): Promise<void> {
  const stale = await prisma.mcpPendingAction.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() }, ...(teacherId ? { teacherId } : {}) },
    select: { id: true, teacherId: true, grantId: true, clientId: true, tool: true, quizId: true, summary: true },
    take: 500,
  });
  for (const a of stale) {
    const r = await prisma.mcpPendingAction.updateMany({ where: { id: a.id, status: "PENDING" }, data: { status: "EXPIRED", resolvedAt: new Date() } });
    if (r.count === 1) {
      audit({ teacherId: a.teacherId, grantId: a.grantId, clientId: a.clientId }, "mcp.action.expire", {
        quizId: a.quizId, actionId: a.id, tool: a.tool, summary: `Muddati o'tdi: ${a.summary}`, status: 410,
      });
    }
  }
}
export { expireStale as expirePendingActions };

async function findOwnAction(ctx: McpContext, actionId: string) {
  if (!/^rqx_[A-Za-z0-9_-]{20,}$/.test(actionId)) throw new McpToolError("actionId noto'g'ri.");
  const a = await prisma.mcpPendingAction.findUnique({ where: { actionHash: sha256(actionId) } });
  // Boshqa foydalanuvchi yoki boshqa ilova (grant) amali — mavjudligini ham oshkor qilmaymiz
  if (!a || a.teacherId !== ctx.teacherId || a.grantId !== ctx.grantId) throw new McpToolError("Amal topilmadi.");
  return a;
}

function statusError(status: string): McpToolError {
  if (status === "EXECUTED") return new McpToolError("Bu amal allaqachon bajarilgan.");
  if (status === "CANCELLED") return new McpToolError("Bu amal bekor qilingan.");
  if (status === "EXPIRED") return new McpToolError("Amal muddati o'tgan (10 daqiqa). Qaytadan taklif qiling.");
  if (status === "FAILED") return new McpToolError("Bu amal avval xato bilan tugagan. Qaytadan taklif qiling.");
  return new McpToolError("Amal hozir bajarilmoqda.");
}

export async function cancelAction(ctx: McpContext, actionId: string) {
  const a = await findOwnAction(ctx, actionId);
  const r = await prisma.mcpPendingAction.updateMany({ where: { id: a.id, status: "PENDING" }, data: { status: "CANCELLED", resolvedAt: new Date() } });
  if (r.count !== 1) throw statusError(a.status);
  audit(ctx, "mcp.action.cancel", { quizId: a.quizId, actionId, tool: a.tool, summary: `Rad etildi: ${a.summary}` });
  return { status: "cancelled", summary: a.summary };
}

/** Platformadagi "Kutilayotgan amallar" ro'yxatidan bekor qilish (MCP'siz, JWT bilan). */
export async function cancelActionById(teacherId: string, id: string): Promise<boolean> {
  const a = await prisma.mcpPendingAction.findFirst({ where: { id, teacherId } });
  if (!a) return false;
  const r = await prisma.mcpPendingAction.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED", resolvedAt: new Date() } });
  if (r.count === 1) {
    audit({ teacherId, grantId: a.grantId, clientId: a.clientId }, "mcp.action.cancel", {
      quizId: a.quizId, actionId: a.id, tool: a.tool, summary: `Platformada bekor qilindi: ${a.summary}`,
    });
  }
  return r.count === 1;
}

async function localizeOrFail(slides: BuiltSlide[]): Promise<void> {
  const r = await localizeSlideImages(slides);
  if (r.failed > 0) throw new McpToolError(`${r.failed} ta rasmni yuklab bo'lmadi. Boshqa rasm manzilini bering yoki rasmsiz qo'shing.`);
  const json = JSON.stringify(slides.map((s) => s.data));
  if (/"(imageUrl|url|value)":"https:\/\//.test(json)) throw new McpToolError("Rasmni yuklab bo'lmadi. Boshqa rasm manzilini bering.");
}

export async function confirmAction(ctx: McpContext, me: McpUser, actionId: string) {
  const a = await findOwnAction(ctx, actionId);
  if (a.status === "PENDING" && a.expiresAt < new Date()) {
    await expireStale(ctx.teacherId);
    throw statusError("EXPIRED");
  }
  // Atomar: faqat bir marta bajariladi
  const claimed = await prisma.mcpPendingAction.updateMany({
    where: { id: a.id, status: "PENDING", expiresAt: { gt: new Date() } },
    data: { status: "EXECUTING" },
  });
  if (claimed.count !== 1) throw statusError(a.status === "PENDING" ? "EXECUTING" : a.status);
  audit(ctx, "mcp.action.confirm", { quizId: a.quizId, actionId, tool: a.tool, summary: `Tasdiqlandi: ${a.summary}` });

  const p = a.params as any;
  try {
    let result: Record<string, unknown>;
    const actor = { id: me.id, name: me.name };
    if (a.tool === "create_quiz") {
      if (p.folderId) {
        const f = await prisma.folder.findFirst({ where: me.isAdmin ? { id: p.folderId } : { id: p.folderId, teacherId: me.id } });
        if (!f) throw new McpToolError("Papka topilmadi.");
      }
      const slides = p.slides as BuiltSlide[];
      await localizeOrFail(slides);
      const q = await createQuizWithSlides(me.id, p.title, p.description ?? null, p.folderId ?? null, slides);
      result = { quizId: q.id, quizVersion: 1, slideCount: slides.length };
    } else {
      const access = await quizAccess(me.id, a.quizId!);
      if (!access?.edit) throw new McpToolError("Bu quizni tahrirlash huquqingiz yo'q.");
      if (a.tool === "add_slide") {
        const slide = p.slide as BuiltSlide;
        await localizeOrFail([slide]);
        const w = await writeQuiz(a.quizId!, { expectedVersion: a.quizVersion!, source: "mcp", actor, summary: a.summary }, (tx) =>
          insertSlide(tx, a.quizId!, slide, p.position),
        );
        result = { slideId: w.result.id, position: w.result.position, quizVersion: w.version };
      } else if (a.tool === "reorder_slides") {
        const w = await writeQuiz(a.quizId!, { expectedVersion: a.quizVersion!, source: "mcp", actor, summary: a.summary }, (tx) =>
          reorderSlides(tx, a.quizId!, p.order as string[]),
        );
        result = { quizVersion: w.version };
      } else {
        // Yangi holat tranzaksiyadan TASHQARIDA hisoblanadi (rasm yuklash qulfni ushlab turmasin).
        // Versiya tranzaksiya ichida tekshiriladi: shu orada quiz o'zgarsa — konflikt, hech narsa yozilmaydi.
        const row = await prisma.slide.findFirst({ where: { id: p.slideId, quizId: a.quizId! } });
        if (!row) throw new McpToolError("Slayd topilmadi — get_quiz bilan yangi ro'yxatni oling.");
        const slide = wrapValidation(() => computeSlide(a.tool as SlideTool, slideRowToBuilt(row), p));
        await localizeOrFail([slide]);
        const w = await writeQuiz(a.quizId!, { expectedVersion: a.quizVersion!, source: "mcp", actor, summary: a.summary }, async (tx) => {
          const still = await tx.slide.findFirst({ where: { id: row.id, quizId: a.quizId! }, select: { id: true } });
          if (!still) throw new McpToolError("Slayd topilmadi — get_quiz bilan yangi ro'yxatni oling.");
          await updateSlideRow(tx, row.id, slide);
          return row.id;
        });
        result = { slideId: w.result, quizVersion: w.version };
      }
    }
    await prisma.mcpPendingAction.update({ where: { id: a.id }, data: { status: "EXECUTED", resolvedAt: new Date(), result: result as object } });
    audit(ctx, "mcp.action.execute", { quizId: a.quizId ?? (result.quizId as string), actionId, tool: a.tool, summary: `Bajarildi: ${a.summary}`, details: { result } });
    return { status: "done", summary: a.summary, ...result };
  } catch (e) {
    const msg =
      e instanceof VersionConflictError ? CONFLICT_MESSAGE
        : e instanceof QuizNotFoundError ? "Quiz topilmadi."
        : e instanceof McpToolError ? e.message
        : "Server xatosi. Amal bajarilmadi.";
    if (!(e instanceof McpToolError || e instanceof VersionConflictError || e instanceof QuizNotFoundError)) console.error("[mcp] confirm xatosi:", e);
    await prisma.mcpPendingAction.update({ where: { id: a.id }, data: { status: "FAILED", resolvedAt: new Date(), result: { error: msg } } });
    audit(ctx, "mcp.action.fail", { quizId: a.quizId, actionId, tool: a.tool, summary: `Bajarilmadi: ${a.summary} — ${msg}`, status: 409 });
    throw new McpToolError(msg);
  }
}
