import crypto from "node:crypto";
import { config } from "../config.js";

// ---- MCP/OAuth uchun umumiy xavfsizlik yordamchilari ----

/** Kriptografik tasodifiy token (256 bit), prefiks bilan — log'da turini tanish oson bo'lsin. */
export function randomToken(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;
}

/** Bazada saqlash uchun hash (tokenning o'zi hech qachon saqlanmaydi). */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Vaqtga chidamli (timing-safe) hash taqqoslash. */
export function hashEquals(value: string, hash: string): boolean {
  const a = Buffer.from(sha256(value), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Log uchun: tokenning faqat oxirgi 4 belgisi. */
export function maskToken(token: string): string {
  return token.length > 4 ? `…${token.slice(-4)}` : "…";
}

/** MCP resurs manzili (token aynan shu resurs uchun beriladi). */
export function mcpResourceUrl(): string {
  return `${config.mcp.issuerUrl}/mcp`;
}

/** Himoyalangan resurs metadata manzili — 401 javobidagi WWW-Authenticate'da ko'rsatiladi. */
export function resourceMetadataUrl(): string {
  return `${config.mcp.issuerUrl}/.well-known/oauth-protected-resource`;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * redirect_uri ruxsat etilganmi: MCP_ALLOWED_REDIRECTS ro'yxatida ANIQ mos kelishi kerak.
 * Faqat dev'da (NODE_ENV != production) — qo'shimcha localhost/127.0.0.1 (istalgan port),
 * MCP Inspector kabi lokal vositalar uchun.
 */
export function isRedirectAllowed(uri: string): boolean {
  if (config.mcp.allowedRedirects.includes(uri)) return true;
  if (config.production) return false;
  try {
    const u = new URL(uri);
    return (u.protocol === "http:" || u.protocol === "https:") && LOOPBACK.has(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}
