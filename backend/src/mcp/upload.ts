import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { config } from "../config.js";
import { UPLOADS_DIR } from "../routes/upload.js";
import { writeAuditEvent } from "../lib/audit.js";
import { guard, McpToolError, type McpContext } from "./context.js";
import { writeRateLimited } from "./actions.js";

// ---- MCP ilovasi uchun rasm yuklash ----
// MCP tool argumentida katta fayl yuborib bo'lmaydi, shuning uchun create_image_upload tool'i
// qisqa muddatli imzolangan havola beradi; ilova (masalan slayd zavodi skripti) unga
// `curl -F file=@slide.png <havola>` bilan fayl yuboradi va /uploads/... manzilini oladi.
// Havola: shu ustoz + shu ruxsat (grant), 30 daqiqa, ko'pi bilan MAX_FILES ta fayl.
// Har yuklashda grant va huquq (quiz:write, uy vazifa bloki) QAYTA tekshiriladi.

export const UPLOAD_TTL_MS = 30 * 60 * 1000;
export const UPLOAD_MAX_FILES = 60;
export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

interface UploadClaims {
  t: string; // teacherId
  g: string; // grantId
  c: string; // clientId
  exp: number;
  n: string; // nonce — fayllar sonini sanash uchun
}

const used = new Map<string, { count: number; exp: number }>();

function sign(body: string): string {
  return crypto.createHmac("sha256", `mcp-upload:${config.jwtSecret}`).update(body).digest("base64url");
}

export function createUploadToken(ctx: McpContext): { token: string; expiresAt: Date } {
  const exp = Date.now() + UPLOAD_TTL_MS;
  const claims: UploadClaims = { t: ctx.teacherId, g: ctx.grantId, c: ctx.clientId, exp, n: crypto.randomBytes(12).toString("base64url") };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: `rqu_${body}.${sign(body)}`, expiresAt: new Date(exp) };
}

function readToken(token: string): UploadClaims | null {
  const m = /^rqu_([A-Za-z0-9_-]{10,1000})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!m) return null;
  const expected = Buffer.from(sign(m[1]));
  const got = Buffer.from(m[2]);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")) as UploadClaims;
    if (typeof c.exp !== "number" || c.exp < Date.now()) return null;
    return c;
  } catch {
    return null;
  }
}

/** Fayl turini mazmunidan aniqlaymiz (kengaytma/mimetype'ga ishonmaymiz). */
function sniffImage(buf: Buffer): "png" | "jpg" | "webp" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  return null;
}

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of used) if (v.exp < now) used.delete(k);
}

const memory = multer({ storage: multer.memoryStorage(), limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 } });

export function mcpUploadRouter(): Router {
  const router = Router();
  router.post("/mcp-upload/:token", (req: Request, res: Response) => {
    const claims = readToken(String(req.params.token));
    if (!claims) {
      res.status(401).json({ error: "Yuklash havolasi yaroqsiz yoki muddati o'tgan. create_image_upload bilan yangisini oling." });
      return;
    }
    memory.single("file")(req, res, async (err: unknown) => {
      if (err) {
        const big = err instanceof Error && /too large/i.test(err.message);
        res.status(400).json({ error: big ? "Fayl juda katta (15MB gacha)" : "Faylni o'qib bo'lmadi. Maydon nomi: file (bitta fayl)" });
        return;
      }
      try {
        const ctx: McpContext = { teacherId: claims.t, grantId: claims.g, clientId: claims.c };
        await guard(ctx, "quiz:write");
        if (writeRateLimited(`upload:${claims.g}`, 120)) {
          res.status(429).json({ error: "Juda ko'p yuklash. Bir daqiqadan keyin qayta urinib ko'ring." });
          return;
        }
        const file = (req as unknown as { file?: { buffer: Buffer } }).file;
        if (!file) {
          res.status(400).json({ error: "Fayl yuborilmadi (maydon nomi: file)" });
          return;
        }
        const ext = sniffImage(file.buffer);
        if (!ext) {
          res.status(400).json({ error: "Faqat PNG, JPEG yoki WebP rasm yuklash mumkin" });
          return;
        }
        sweep();
        const u = used.get(claims.n) ?? { count: 0, exp: claims.exp };
        if (u.count >= UPLOAD_MAX_FILES) {
          res.status(429).json({ error: `Bitta havola bilan ko'pi bilan ${UPLOAD_MAX_FILES} ta fayl. Yangi havola oling.` });
          return;
        }
        u.count += 1;
        used.set(claims.n, u);
        const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
        await fs.writeFile(path.join(UPLOADS_DIR, name), file.buffer);
        const url = `/uploads/${name}`;
        void writeAuditEvent({
          actorId: claims.t,
          action: "mcp.upload",
          method: "MCP",
          path: "/mcp-upload",
          status: 200,
          summary: `MCP orqali rasm yuklandi (${Math.round(file.buffer.length / 1024)} KB)`,
          details: { source: "mcp", url, bytes: file.buffer.length },
        });
        res.json({ url, remaining: UPLOAD_MAX_FILES - u.count });
      } catch (e) {
        if (e instanceof McpToolError) {
          res.status(403).json({ error: e.message });
          return;
        }
        console.error("[mcp] upload xatosi:", e);
        res.status(500).json({ error: "Server xatosi" });
      }
    });
  });
  return router;
}
