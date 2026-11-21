import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "../prisma.js";
import { isHwBlocked, HW_BLOCKED_MESSAGE } from "../services/hwGate.js";
import { effectiveScopes, parseScopes, loadScopeSubject, type Scope } from "./scopes.js";

// Har bir MCP tool chaqiruvi shu kontekst bilan ishlaydi (token'dan olingan).
export interface McpContext {
  teacherId: string;
  grantId: string;
  clientId: string;
}

export class McpToolError extends Error {}

export interface McpUser {
  id: string;
  name: string;
  isAdmin: boolean;
  canCreate: boolean;
  scopes: Scope[];
}

/**
 * Har chaqiruvda HOZIRGI holatni qayta tekshiradi (token tekshiruvidan alohida):
 *  - ruxsat (grant) bekor qilinmaganmi;
 *  - foydalanuvchining hozirgi huquqi bilan kesilgan scope'larda `need` bormi
 *    (admin canCreate'ni olsa yoki ustoz huquqi olinsa — darhol ta'sir qiladi);
 *  - uy vazifa bloki (platformadagi bilan bir xil xabar).
 */
export async function guard(ctx: McpContext, need: Scope): Promise<McpUser> {
  const [grant, subject, teacher] = await Promise.all([
    prisma.oAuthGrant.findUnique({ where: { id: ctx.grantId }, select: { scopes: true, revokedAt: true, teacherId: true } }),
    loadScopeSubject(ctx.teacherId),
    prisma.teacher.findUnique({ where: { id: ctx.teacherId }, select: { id: true, name: true } }),
  ]);
  if (!grant || grant.revokedAt || grant.teacherId !== ctx.teacherId || !teacher || !subject) {
    throw new McpToolError("Ruxsat bekor qilingan. Robbit Quiz'ga qayta ulaning.");
  }
  const scopes = effectiveScopes(parseScopes(grant.scopes), subject);
  if (!scopes.includes(need)) {
    throw new McpToolError(
      need === "quiz:read"
        ? "Sizda Robbit Quiz'dan foydalanish huquqi yo'q. Admin bilan bog'laning."
        : "Sizda slayd yaratish huquqi yo'q. Admin bilan bog'laning.",
    );
  }
  if (await isHwBlocked(ctx.teacherId)) throw new McpToolError(HW_BLOCKED_MESSAGE);
  return { id: teacher.id, name: teacher.name, isAdmin: subject.isAdmin, canCreate: subject.canCreate, scopes };
}

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** Tool handler'ini o'raydi: McpToolError → tushunarli xato, boshqasi → umumiy xato (log'ga). */
export async function run(fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof McpToolError) return fail(e.message);
    console.error("[mcp] tool xatosi:", e);
    return fail("Server xatosi. Birozdan keyin qayta urinib ko'ring.");
  }
}
