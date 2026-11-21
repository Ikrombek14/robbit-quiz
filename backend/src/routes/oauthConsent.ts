import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireAdmin, type AuthedRequest } from "../auth.js";
import { auditNote } from "../lib/audit.js";
import { CODE_TTL_MS, revokeGrant } from "../mcp/provider.js";
import { randomToken, sha256 } from "../mcp/security.js";
import { SCOPES, SCOPE_LABELS, parseScopes, allowedScopes, loadScopeSubject, type Scope } from "../mcp/scopes.js";
import { cancelActionById, expirePendingActions } from "../mcp/actions.js";

// Ruxsat (consent) sahifasi va "Ulangan ilovalar" API'si — SPA chaqiradi (JWT bilan).
// So'rov tokeni yo'lga (path) emas, query/body'ga qo'yiladi: audit log yo'lni yozadi,
// token esa log'ga tushmasligi kerak.

export const oauthConsentRouter = Router();
oauthConsentRouter.use(requireAuth);

const scopeView = (s: Scope) => ({ scope: s, label: SCOPE_LABELS[s] });

function redirectHost(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}

async function loadRequest(reqToken: string) {
  if (!reqToken || reqToken.length > 200) return null;
  const r = await prisma.oAuthAuthRequest.findUnique({ where: { id: sha256(reqToken) } });
  if (!r || r.usedAt || r.expiresAt < new Date()) return null;
  return r;
}

// Ruxsat sahifasi uchun ma'lumot: qaysi ilova, nima so'rayapti, foydalanuvchiga nima beriladi
oauthConsentRouter.get("/consent", async (req: AuthedRequest, res) => {
  const r = await loadRequest(String(req.query.req ?? ""));
  if (!r) {
    res.status(404).json({ error: "Ruxsat so'rovi topilmadi yoki muddati o'tgan. Ilovada ulanishni qaytadan boshlang." });
    return;
  }
  const client = await prisma.oAuthClient.findUnique({ where: { id: r.clientId }, select: { name: true } });
  const subject = await loadScopeSubject(req.teacherId!);
  const requested = parseScopes(r.scopes);
  const allowed = allowedScopes(subject);
  const granted = requested.filter((s) => allowed.includes(s));
  res.json({
    client: { name: client?.name ?? "Noma'lum ilova", redirectHost: redirectHost(r.redirectUri) },
    requested: requested.map(scopeView),
    granted: granted.map(scopeView),
    eligible: granted.length > 0,
    // Yozish so'ralgan, lekin "slayd qilish" huquqi yo'q — faqat ko'rish beriladi
    readOnlyDowngrade: granted.length > 0 && requested.some((s) => !granted.includes(s)),
    expiresAt: r.expiresAt,
  });
});

const decisionSchema = z.object({ req: z.string().min(1).max(200), approve: z.boolean() });

// Foydalanuvchi qarori → client'ning redirect_uri'siga qaytish havolasi
oauthConsentRouter.post("/consent/decision", async (req: AuthedRequest, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "So'rov formati noto'g'ri" });
    return;
  }
  const r = await loadRequest(parsed.data.req);
  if (!r) {
    res.status(404).json({ error: "Ruxsat so'rovi topilmadi yoki muddati o'tgan. Ilovada ulanishni qaytadan boshlang." });
    return;
  }
  // Atomar: so'rov faqat bir marta hal qilinadi
  const claimed = await prisma.oAuthAuthRequest.updateMany({
    where: { id: r.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    res.status(409).json({ error: "Bu so'rov allaqachon hal qilingan" });
    return;
  }

  const back = new URL(r.redirectUri);
  if (r.state) back.searchParams.set("state", r.state);
  const client = await prisma.oAuthClient.findUnique({ where: { id: r.clientId }, select: { name: true } });
  const clientName = client?.name ?? "Noma'lum ilova";

  const subject = await loadScopeSubject(req.teacherId!);
  const granted = parseScopes(r.scopes).filter((s) => allowedScopes(subject).includes(s));

  if (!parsed.data.approve || granted.length === 0) {
    back.searchParams.set("error", "access_denied");
    back.searchParams.set("error_description", parsed.data.approve ? "Foydalanuvchida ruxsat yo'q" : "Foydalanuvchi rad etdi");
    auditNote(res, {
      action: "oauth.consent.deny",
      entity: "OAuthClient",
      entityId: r.clientId,
      summary: `${clientName} ilovasiga ruxsat berilmadi`,
    });
    res.json({ redirectUrl: back.href });
    return;
  }

  const code = randomToken("rqc");
  const grant = await prisma.oAuthGrant.create({
    data: {
      teacherId: req.teacherId!,
      clientId: r.clientId,
      scopes: granted.join(" "),
      codes: {
        create: {
          id: sha256(code),
          clientId: r.clientId,
          redirectUri: r.redirectUri,
          codeChallenge: r.codeChallenge,
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      },
    },
    select: { id: true },
  });
  back.searchParams.set("code", code);
  auditNote(res, {
    action: "oauth.consent.approve",
    entity: "OAuthGrant",
    entityId: grant.id,
    summary: `${clientName} ilovasiga ruxsat berildi: ${granted.join(", ")}`,
    details: { clientId: r.clientId, scopes: granted },
  });
  res.json({ redirectUrl: back.href });
});

// ---- Ulangan ilovalar ----
async function listGrants(teacherId: string) {
  const grants = await prisma.oAuthGrant.findMany({
    where: { teacherId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    include: { client: { select: { name: true } } },
  });
  return grants.map((g) => ({
    id: g.id,
    clientName: g.client.name ?? "Noma'lum ilova",
    scopes: parseScopes(g.scopes).map(scopeView),
    createdAt: g.createdAt,
    lastUsedAt: g.lastUsedAt,
  }));
}

oauthConsentRouter.get("/grants", async (req: AuthedRequest, res) => {
  res.json({ grants: await listGrants(req.teacherId!), allScopes: SCOPES.map(scopeView) });
});

oauthConsentRouter.delete("/grants/:id", async (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  const g = await prisma.oAuthGrant.findFirst({ where: { id, teacherId: req.teacherId }, include: { client: { select: { name: true } } } });
  if (!g) {
    res.status(404).json({ error: "Ruxsat topilmadi" });
    return;
  }
  await revokeGrant(id, req.teacherId!);
  auditNote(res, { action: "oauth.grant.revoke", entity: "OAuthGrant", entityId: id, summary: `${g.client.name ?? "Ilova"} ruxsati bekor qilindi` });
  res.json({ ok: true });
});

// ---- Kutilayotgan tasdiqlar (MCP takliflari) ----
oauthConsentRouter.get("/pending", async (req: AuthedRequest, res) => {
  await expirePendingActions(req.teacherId!);
  const rows = await prisma.mcpPendingAction.findMany({
    where: { teacherId: req.teacherId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const names = new Map(
    (await prisma.oAuthClient.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.clientId))] } }, select: { id: true, name: true } })).map(
      (c) => [c.id, c.name ?? "MCP ilova"],
    ),
  );
  res.json({
    pending: rows.map((r) => ({
      id: r.id,
      clientName: names.get(r.clientId) ?? "MCP ilova",
      summary: r.summary,
      preview: r.preview,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
    })),
  });
});

oauthConsentRouter.delete("/pending/:id", async (req: AuthedRequest, res) => {
  const ok = await cancelActionById(req.teacherId!, String(req.params.id));
  if (!ok) {
    res.status(404).json({ error: "Kutilayotgan amal topilmadi (allaqachon bajarilgan, bekor qilingan yoki muddati o'tgan)" });
    return;
  }
  res.json({ ok: true });
});

// ---- Admin: istalgan foydalanuvchining ruxsatlari ----
oauthConsentRouter.get("/admin/users/:teacherId/grants", requireAdmin, async (req: AuthedRequest, res) => {
  res.json({ grants: await listGrants(String(req.params.teacherId)) });
});

oauthConsentRouter.delete("/admin/grants/:id", requireAdmin, async (req: AuthedRequest, res) => {
  const id = String(req.params.id);
  const g = await prisma.oAuthGrant.findUnique({
    where: { id },
    include: { client: { select: { name: true } }, teacher: { select: { name: true } } },
  });
  if (!g) {
    res.status(404).json({ error: "Ruxsat topilmadi" });
    return;
  }
  await revokeGrant(id, req.teacherId!);
  auditNote(res, {
    action: "oauth.grant.admin_revoke",
    entity: "OAuthGrant",
    entityId: id,
    summary: `Admin ${g.teacher.name} uchun ${g.client.name ?? "ilova"} ruxsatini bekor qildi`,
  });
  res.json({ ok: true });
});
