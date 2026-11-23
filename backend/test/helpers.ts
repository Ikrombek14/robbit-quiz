import crypto from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import request from "supertest";
import { prisma } from "../src/prisma.js";
import { signToken } from "../src/auth.js";
import { auditMiddleware } from "../src/lib/audit.js";
import { hwBlockGuard } from "../src/services/hwGate.js";
import { oauthRouter } from "../src/mcp/oauthRoutes.js";
import { mcpRouter } from "../src/mcp/server.js";
import { oauthConsentRouter } from "../src/routes/oauthConsent.js";
import { quizRouter } from "../src/routes/quizzes.js";

// index.ts bilan bir xil tartibda yig'ilgan ilova (listen/scheduler'siz)
export function buildApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "1mb" }));
  app.use(auditMiddleware);
  app.use(oauthRouter());
  app.use(mcpRouter());
  app.use("/api", hwBlockGuard);
  app.use("/api/oauth", oauthConsentRouter);
  app.use("/api/quizzes", quizRouter);
  return app;
}

export async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}

export async function resetDb(): Promise<void> {
  const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (!db.endsWith("_test")) throw new Error(`Test bazasi emas: ${db}`);
  await prisma.$executeRawUnsafe(
    `TRUNCATE "McpPendingAction","QuizRevision","OAuthToken","OAuthCode","OAuthGrant","OAuthAuthRequest","OAuthClient","Slide","Quiz","Folder","LessonPlan","NewCurriculumLesson","Workshop","ExtraLesson","GameRecord","AuditLog","Teacher" CASCADE`,
  );
}

let n = 0;
export async function makeTeacher(over: Partial<{ isAdmin: boolean; approved: boolean; canCreate: boolean; hwStrikes: number; name: string }> = {}) {
  n += 1;
  const t = await prisma.teacher.create({
    data: {
      email: `t${n}-${Date.now()}@test.local`,
      name: over.name ?? `Ustoz ${n}`,
      isAdmin: over.isAdmin ?? false,
      approved: over.approved ?? true,
      canCreate: over.canCreate ?? false,
      hwStrikes: over.hwStrikes ?? 0,
    },
  });
  return { ...t, jwt: signToken(t.id) };
}

export async function makeQuiz(teacherId: string, title: string, slides = 2) {
  return prisma.quiz.create({
    data: {
      title,
      teacherId,
      slides: {
        create: Array.from({ length: slides }, (_, i) => ({
          order: i,
          kind: "QUESTION",
          type: "SINGLE",
          data: JSON.stringify({ text: `${title} savol ${i + 1}`, options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }] }),
        })),
      },
    },
    include: { slides: { orderBy: { order: "asc" } } },
  });
}

export function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export const REDIRECT = "http://localhost:6274/oauth/callback"; // dev'da loopback ruxsat etilgan

export async function registerClient(app: express.Express, redirect = REDIRECT) {
  const r = await request(app)
    .post("/oauth/register")
    .send({ client_name: "Test Claude", redirect_uris: [redirect], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] });
  return r;
}

/** To'liq OAuth oqimi: register → authorize → consent → token. */
export async function connect(app: express.Express, teacherJwt: string, opts: { scope?: string; approve?: boolean } = {}) {
  const reg = await registerClient(app);
  if (reg.status !== 201) throw new Error(`register ${reg.status} ${JSON.stringify(reg.body)}`);
  const clientId: string = reg.body.client_id;
  const { verifier, challenge } = pkce();
  const auth = await request(app)
    .get("/oauth/authorize")
    .query({
      response_type: "code",
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "st-123",
      ...(opts.scope ? { scope: opts.scope } : {}),
      resource: "http://localhost:4000/mcp",
    });
  if (auth.status !== 302) throw new Error(`authorize ${auth.status} ${auth.text}`);
  const consentUrl = new URL(auth.headers.location);
  const reqToken = consentUrl.searchParams.get("req")!;
  const info = await request(app).get("/api/oauth/consent").query({ req: reqToken }).set("Authorization", `Bearer ${teacherJwt}`);
  const decision = await request(app)
    .post("/api/oauth/consent/decision")
    .set("Authorization", `Bearer ${teacherJwt}`)
    .send({ req: reqToken, approve: opts.approve ?? true });
  const back = new URL(decision.body.redirectUrl);
  const code = back.searchParams.get("code");
  let tokens: Record<string, any> | null = null;
  if (code) {
    const tok = await request(app)
      .post("/oauth/token")
      .type("form")
      .send({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT });
    if (tok.status !== 200) throw new Error(`token ${tok.status} ${JSON.stringify(tok.body)}`);
    tokens = tok.body;
  }
  return { clientId, verifier, consentUrl, reqToken, info, decision, back, code, tokens };
}
