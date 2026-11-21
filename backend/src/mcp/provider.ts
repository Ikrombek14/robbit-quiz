import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidRequestError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { writeAuditEvent } from "../lib/audit.js";
import { randomToken, sha256, isRedirectAllowed, mcpResourceUrl } from "./security.js";
import { SCOPES, parseScopes, effectiveScopes, loadScopeSubject, type Scope } from "./scopes.js";

// ---- OAuth 2.1 authorization server (MCP Authorization spetsifikatsiyasi) ----
// SDK handler'lari (authorize/token/register/revoke) protokolni (PKCE S256, redirect_uri
// mosligi, so'rov formatlari) tekshiradi; bu provayder esa holatni bazada saqlaydi.
// Barcha maxfiy qiymatlar faqat SHA-256 hash ko'rinishida saqlanadi.

export const AUTH_REQUEST_TTL_MS = 10 * 60 * 1000; // ruxsat sahifasida o'ylab olish uchun
export const CODE_TTL_MS = 5 * 60 * 1000;
export const ACCESS_TTL_S = 60 * 60; // 1 soat
export const REFRESH_TTL_S = 30 * 24 * 60 * 60; // 30 kun
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

function sameResource(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/#.*$/, "").replace(/\/$/, "");
  return norm(a) === norm(b);
}

// ---------- Client'lar (Dynamic Client Registration) ----------
export const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId: string) {
    const c = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
    if (!c) return undefined;
    const meta = (c.metadata ?? {}) as Record<string, unknown>;
    // client_secret ATAYLAB qaytarilmaydi: u bazada faqat hash. Confidential client'ning
    // secret'i token/revoke endpoint'laridan OLDIN verifyClientSecret middleware'ida tekshiriladi.
    return {
      ...meta,
      client_id: c.id,
      client_id_issued_at: Math.floor(c.createdAt.getTime() / 1000),
      redirect_uris: JSON.parse(c.redirectUris) as string[],
    } as OAuthClientInformationFull;
  },

  async registerClient(info) {
    const full = info as OAuthClientInformationFull;
    const uris = (full.redirect_uris ?? []).map(String);
    const bad = uris.filter((u) => !isRedirectAllowed(u));
    if (uris.length === 0 || bad.length > 0) {
      throw new InvalidClientMetadataError(`redirect_uri ruxsat etilmagan: ${bad.join(", ") || "(bo'sh)"}`);
    }
    const { client_secret, client_secret_expires_at, ...meta } = full as OAuthClientInformationFull & {
      client_secret?: string;
      client_secret_expires_at?: number;
    };
    const name = typeof meta.client_name === "string" ? meta.client_name.slice(0, 200) : null;
    await prisma.oAuthClient.create({
      data: {
        id: full.client_id,
        name,
        redirectUris: JSON.stringify(uris),
        metadata: meta as object,
        secretHash: client_secret ? sha256(client_secret) : null,
        secretExpiresAt: client_secret_expires_at ?? null,
      },
    });
    writeAuditEvent({
      action: "oauth.client.register",
      path: "/oauth/register",
      status: 201,
      entity: "OAuthClient",
      entityId: full.client_id,
      summary: `OAuth client ro'yxatdan o'tdi: ${name ?? "(nomsiz)"}`,
      details: { redirectUris: uris, confidential: !!client_secret },
    });
    return full; // secret mijozga faqat shu bir marta qaytadi
  },
};

/** Confidential client secret'ini hash bo'yicha tekshiradi (public client — secret'siz). */
export async function checkClientSecret(clientId: string, secret: string | undefined): Promise<string | null> {
  const c = await prisma.oAuthClient.findUnique({ where: { id: clientId }, select: { secretHash: true, secretExpiresAt: true } });
  if (!c) return null; // SDK o'zi "Invalid client_id" qaytaradi
  if (!c.secretHash) return null;
  if (!secret) return "Client secret is required";
  if (sha256(secret) !== c.secretHash) return "Invalid client_secret";
  if (c.secretExpiresAt && c.secretExpiresAt < Math.floor(Date.now() / 1000)) return "Client secret has expired";
  return null;
}

// ---------- Tokenlar ----------
async function issueTokens(grantId: string, scopes: string, family?: string): Promise<OAuthTokens> {
  const access = randomToken("rqa");
  const refresh = randomToken("rqr");
  const fam = family ?? randomToken("fam");
  const now = Date.now();
  await prisma.oAuthToken.createMany({
    data: [
      { tokenHash: sha256(access), kind: "ACCESS", grantId, family: fam, expiresAt: new Date(now + ACCESS_TTL_S * 1000) },
      { tokenHash: sha256(refresh), kind: "REFRESH", grantId, family: fam, expiresAt: new Date(now + REFRESH_TTL_S * 1000) },
    ],
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: scopes };
}

async function revokeFamily(family: string): Promise<void> {
  await prisma.oAuthToken.updateMany({ where: { family, revokedAt: null }, data: { revokedAt: new Date() } });
}

/** Ruxsatni (grant) va uning BARCHA tokenlarini bekor qiladi (foydalanuvchi yoki admin). */
export async function revokeGrant(grantId: string, byTeacherId: string | null): Promise<boolean> {
  const now = new Date();
  const r = await prisma.oAuthGrant.updateMany({
    where: { id: grantId, revokedAt: null },
    data: { revokedAt: now, revokedBy: byTeacherId },
  });
  await prisma.oAuthToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: now } });
  await prisma.oAuthCode.updateMany({ where: { grantId, usedAt: null }, data: { usedAt: now } });
  return r.count > 0;
}

/** Ishlatilgan code qayta keldi — o'g'irlangan bo'lishi mumkin: grant va tokenlari bekor (RFC 6749 §4.1.2). */
async function onCodeReplay(grantId: string, teacherId: string): Promise<void> {
  const revoked = await revokeGrant(grantId, null);
  if (!revoked) return;
  writeAuditEvent({
    actorId: teacherId,
    action: "oauth.code.replay",
    path: "/oauth/token",
    status: 400,
    entity: "OAuthGrant",
    entityId: grantId,
    summary: "Authorization code qayta ishlatildi — ruxsat xavfsizlik uchun bekor qilindi",
  });
}

/** Grant'ning HOZIRGI samarali scope'lari (foydalanuvchi huquqi o'zgargan bo'lsa kesiladi). */
async function grantEffectiveScopes(grant: { teacherId: string; scopes: string }): Promise<Scope[]> {
  return effectiveScopes(parseScopes(grant.scopes), await loadScopeSubject(grant.teacherId));
}

// ---------- Provayder ----------
export const oauthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore;
  },

  // /oauth/authorize — SDK client_id, redirect_uri (ro'yxatdagiga aniq mos), PKCE S256'ni
  // tekshirgan. Biz so'rovni saqlab, SPA'dagi ruxsat sahifasiga yo'naltiramiz: login JWT
  // brauzer localStorage'ida, server uni ko'ra olmaydi — sahifa o'zi JWT bilan javob qaytaradi.
  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (!isRedirectAllowed(params.redirectUri)) {
      throw new InvalidRequestError("redirect_uri ruxsat etilmagan");
    }
    if (params.resource && !sameResource(params.resource.href, mcpResourceUrl())) {
      throw new InvalidTargetError("Noma'lum resurs");
    }
    const requested = params.scopes && params.scopes.length > 0 ? params.scopes : [...SCOPES];
    const unknown = requested.filter((s) => !(SCOPES as readonly string[]).includes(s));
    if (unknown.length > 0) throw new InvalidScopeError(`Noma'lum scope: ${unknown.join(", ")}`);

    const reqToken = randomToken("rqq");
    await prisma.oAuthAuthRequest.create({
      data: {
        id: sha256(reqToken),
        clientId: client.client_id,
        redirectUri: params.redirectUri,
        codeChallenge: params.codeChallenge,
        state: params.state ?? null,
        scopes: requested.join(" "),
        resource: params.resource?.href ?? null,
        expiresAt: new Date(Date.now() + AUTH_REQUEST_TTL_MS),
      },
    });
    res.redirect(302, `${config.clientUrl.replace(/\/$/, "")}/oauth/consent?req=${encodeURIComponent(reqToken)}`);
  },

  // SDK token almashtirishdan OLDIN shuni chaqiradi — qayta ishlatilgan code shu yerda ushlanadi
  async challengeForAuthorizationCode(client, authorizationCode) {
    const code = await prisma.oAuthCode.findUnique({ where: { id: sha256(authorizationCode) }, include: { grant: true } });
    if (code && code.clientId === client.client_id && code.usedAt) {
      await onCodeReplay(code.grantId, code.grant.teacherId);
    }
    if (!code || code.clientId !== client.client_id || code.usedAt || code.expiresAt < new Date()) {
      throw new InvalidGrantError("Authorization code yaroqsiz yoki muddati o'tgan");
    }
    return code.codeChallenge;
  },

  async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri) {
    const id = sha256(authorizationCode);
    // Atomar "bir marta": faqat ishlatilmagan va muddati o'tmagan code band qilinadi
    const claimed = await prisma.oAuthCode.updateMany({
      where: { id, clientId: client.client_id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    const code = await prisma.oAuthCode.findUnique({ where: { id }, include: { grant: true } });
    if (claimed.count !== 1 || !code) {
      // Parallel ikkinchi so'rov (challenge tekshiruvidan o'tib ulgurgan) — xuddi replay
      if (code && code.clientId === client.client_id && code.usedAt) await onCodeReplay(code.grantId, code.grant.teacherId);
      throw new InvalidGrantError("Authorization code yaroqsiz yoki allaqachon ishlatilgan");
    }
    if (redirectUri !== undefined && redirectUri !== code.redirectUri) {
      throw new InvalidGrantError("redirect_uri mos kelmadi");
    }
    if (code.grant.revokedAt) throw new InvalidGrantError("Ruxsat bekor qilingan");
    const scopes = await grantEffectiveScopes(code.grant);
    if (scopes.length === 0) throw new InvalidGrantError("Foydalanuvchida bu ilova uchun ruxsat qolmagan");
    return issueTokens(code.grantId, scopes.join(" "));
  },

  async exchangeRefreshToken(client, refreshToken, requestedScopes) {
    const id = sha256(refreshToken);
    const tok = await prisma.oAuthToken.findUnique({ where: { tokenHash: id }, include: { grant: true } });
    if (!tok || tok.kind !== "REFRESH" || tok.grant.clientId !== client.client_id) {
      throw new InvalidGrantError("Refresh token yaroqsiz");
    }
    if (tok.revokedAt || tok.grant.revokedAt || tok.expiresAt < new Date()) {
      throw new InvalidGrantError("Refresh token bekor qilingan yoki muddati o'tgan");
    }
    // Rotation: refresh faqat BIR marta ishlaydi. Qayta kelsa — butun zanjir bekor (reuse detection)
    const claimed = await prisma.oAuthToken.updateMany({
      where: { id: tok.id, usedAt: null, revokedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      await revokeFamily(tok.family);
      writeAuditEvent({
        actorId: tok.grant.teacherId,
        action: "oauth.refresh.reuse",
        path: "/oauth/token",
        status: 400,
        entity: "OAuthGrant",
        entityId: tok.grantId,
        summary: "Ishlatilgan refresh token qayta keldi — token zanjiri xavfsizlik uchun bekor qilindi",
      });
      throw new InvalidGrantError("Refresh token allaqachon ishlatilgan");
    }
    const scopes = await grantEffectiveScopes(tok.grant);
    if (requestedScopes?.some((s) => !scopes.includes(s as Scope))) {
      throw new InvalidScopeError("So'ralgan scope berilmagan");
    }
    if (scopes.length === 0) throw new InvalidGrantError("Foydalanuvchida bu ilova uchun ruxsat qolmagan");
    return issueTokens(tok.grantId, scopes.join(" "), tok.family);
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const tok = await prisma.oAuthToken.findUnique({ where: { tokenHash: sha256(token) }, include: { grant: true } });
    if (!tok || tok.kind !== "ACCESS" || tok.revokedAt || tok.grant.revokedAt) {
      throw new InvalidTokenError("Token yaroqsiz yoki bekor qilingan");
    }
    if (tok.expiresAt < new Date()) throw new InvalidTokenError("Token muddati o'tgan");
    const last = tok.grant.lastUsedAt?.getTime() ?? 0;
    if (Date.now() - last > LAST_USED_THROTTLE_MS) {
      void prisma.oAuthGrant.update({ where: { id: tok.grantId }, data: { lastUsedAt: new Date() } }).catch(() => {});
    }
    return {
      token,
      clientId: tok.grant.clientId,
      // Grant'da yozilgan scope'lar; HOZIRGI huquq har tool chaqiruvida alohida tekshiriladi
      scopes: parseScopes(tok.grant.scopes),
      expiresAt: Math.floor(tok.expiresAt.getTime() / 1000),
      resource: new URL(mcpResourceUrl()),
      extra: { teacherId: tok.grant.teacherId, grantId: tok.grantId },
    };
  },

  async revokeToken(client, request: OAuthTokenRevocationRequest) {
    const tok = await prisma.oAuthToken.findUnique({ where: { tokenHash: sha256(request.token) }, include: { grant: true } });
    if (!tok || tok.grant.clientId !== client.client_id) return; // RFC 7009: noma'lum token — jim
    if (tok.kind === "REFRESH") await revokeFamily(tok.family);
    else await prisma.oAuthToken.updateMany({ where: { id: tok.id, revokedAt: null }, data: { revokedAt: new Date() } });
  },
};

/** Muddati o'tgan oraliq yozuvlarni tozalash (soatiga bir marta). */
export async function cleanupOAuth(): Promise<void> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.oAuthAuthRequest.deleteMany({ where: { expiresAt: { lt: dayAgo } } });
  await prisma.oAuthCode.deleteMany({ where: { expiresAt: { lt: dayAgo } } });
  await prisma.oAuthToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } });
}
