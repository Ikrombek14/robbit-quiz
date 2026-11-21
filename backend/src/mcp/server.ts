import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { oauthProvider } from "./provider.js";
import { mcpResourceUrl, resourceMetadataUrl } from "./security.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";
import { mcpUploadRouter } from "./upload.js";
import type { McpContext } from "./context.js";

// ---- MCP endpoint: Streamable HTTP, /mcp ----
// Stateless rejim: har POST so'rov uchun yangi server+transport (sessiya xotirada saqlanmaydi —
// deploy/restart'da hech narsa yo'qolmaydi). Foydalanuvchi har doim OAuth token'idan olinadi.

const INSTRUCTIONS =
  "Robbit Quiz (robbitquiz.uz) — Robbit Akademiyasining o'zbek tilidagi jonli quiz platformasi. " +
  "Bu server ustozning akkaunti nomidan uning kutubxonasidagi quiz va slaydlarni ko'rsatadi, " +
  "ruxsat bo'lsa yangi quiz/slayd qo'shish va slaydlarni tahrirlashni taklif qiladi. " +
  "Har bir yozuvchi amal ikki bosqichli: tool taklif va preview qaytaradi, foydalanuvchi aniq rozi bo'lgandagina " +
  "confirm_action chaqiriladi. Slayd yoki quizni o'chirish imkoni yo'q — buni faqat platformaning o'zida qilish mumkin. " +
  "Darslar (o'quv dasturlar, workshoplar) list_lessons'da; darsga yangi quiz biriktirish — attach_quiz_to_lesson. " +
  "Tayyor slayd rasmlarini (masalan NotebookLM/PDF sahifalari) create_image_upload havolasi bilan yuklab, " +
  "add_slides'da pageImageUrl bilan to'liq ekranli sahifa slaydi qilib qo'shing. " +
  "Foydalanuvchi bilan o'zbek tilida (lotin) gaplashing.";

export function buildMcpServer(ctx: McpContext, scopes: string[] = []): McpServer {
  const server = new McpServer({ name: "robbit-quiz", version: "2.0.0" }, { instructions: INSTRUCTIONS });
  registerReadTools(server, ctx);
  // Yozish ruxsati berilmagan ulanishda yozuvchi tool'lar ro'yxatda ham ko'rinmaydi
  // (hozirgi huquq baribir har chaqiruvda guard() da qayta tekshiriladi)
  if (scopes.includes("quiz:write")) registerWriteTools(server, ctx);
  return server;
}

type AuthedReq = Request & { auth?: AuthInfo };

function contextFrom(req: AuthedReq): McpContext | null {
  const a = req.auth;
  const teacherId = a?.extra?.teacherId;
  const grantId = a?.extra?.grantId;
  if (!a || typeof teacherId !== "string" || typeof grantId !== "string") return null;
  return { teacherId, grantId, clientId: a.clientId };
}

export function mcpRouter(): Router {
  const router = Router();
  // Imzolangan havola orqali rasm yuklash (token URL'da — bearer kerak emas)
  router.use(mcpUploadRouter());

  const bearer = requireBearerAuth({
    verifier: oauthProvider,
    resourceMetadataUrl: resourceMetadataUrl(),
    expectedResource: new URL(mcpResourceUrl()),
  });

  // Foydalanuvchi (token) boshiga daqiqasiga ~60 so'rov
  const perUser = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `mcp:${String((req as AuthedReq).auth?.extra?.grantId ?? "anon")}`,
    message: { jsonrpc: "2.0", error: { code: -32000, message: "Juda ko'p so'rov. Bir daqiqadan keyin qayta urinib ko'ring." }, id: null },
  });

  router.post("/mcp", bearer, perUser, async (req: AuthedReq, res: Response) => {
    const ctx = contextFrom(req);
    if (!ctx) {
      res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Avtorizatsiya talab qilinadi" }, id: null });
      return;
    }
    const server = buildMcpServer(ctx, req.auth?.scopes ?? []);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      console.error("[mcp] so'rov xatosi:", e);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Server xatosi" }, id: null });
      }
    }
  });

  // Stateless serverda GET (SSE oqimi) va DELETE (sessiya yopish) yo'q
  const notAllowed = (_req: Request, res: Response) => {
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
  };
  router.get("/mcp", bearer, notAllowed);
  router.delete("/mcp", bearer, notAllowed);

  return router;
}
