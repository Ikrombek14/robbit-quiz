import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "../src/prisma.js";
import { sha256 } from "../src/mcp/security.js";
import { buildApp, resetDb, makeTeacher, registerClient, connect, pkce, REDIRECT } from "./helpers.js";

const app = buildApp();

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("OAuth metadata", () => {
  it("authorization server va protected resource metadata beradi", async () => {
    const as = await request(app).get("/.well-known/oauth-authorization-server");
    expect(as.status).toBe(200);
    expect(as.body.authorization_endpoint).toBe("http://localhost:4000/oauth/authorize");
    expect(as.body.registration_endpoint).toBe("http://localhost:4000/oauth/register");
    expect(as.body.code_challenge_methods_supported).toEqual(["S256"]);
    expect(as.body.scopes_supported).toEqual(["quiz:read", "quiz:write"]);

    for (const p of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const pr = await request(app).get(p);
      expect(pr.status).toBe(200);
      expect(pr.body.resource).toBe("http://localhost:4000/mcp");
      expect(pr.body.authorization_servers).toEqual(["http://localhost:4000"]);
    }
  });
});

describe("Dynamic Client Registration", () => {
  it("ruxsat etilmagan redirect_uri rad etiladi", async () => {
    const r = await registerClient(app, "https://evil.example/callback");
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_client_metadata");
    expect(await prisma.oAuthClient.count()).toBe(0);
  });

  it("ruxsat etilgan redirect_uri bilan ro'yxatdan o'tadi; secret faqat hash saqlanadi", async () => {
    const r = await request(app)
      .post("/oauth/register")
      .send({ client_name: "Conf", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "client_secret_post" });
    expect(r.status).toBe(201);
    expect(r.body.client_secret).toBeTruthy();
    const row = await prisma.oAuthClient.findUniqueOrThrow({ where: { id: r.body.client_id } });
    expect(row.secretHash).toBe(sha256(r.body.client_secret));
    expect(JSON.stringify(row.metadata)).not.toContain(r.body.client_secret);
  });
});

describe("Authorization code + PKCE", () => {
  it("to'liq oqim: token beriladi, state qaytadi, faqat hash saqlanadi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    expect(c.consentUrl.origin + c.consentUrl.pathname).toBe("http://localhost:5173/oauth/consent");
    expect(c.info.status).toBe(200);
    expect(c.info.body.eligible).toBe(true);
    expect(c.info.body.client.name).toBe("Test Claude");
    expect(c.back.searchParams.get("state")).toBe("st-123");
    expect(c.tokens!.token_type).toBe("Bearer");
    expect(c.tokens!.expires_in).toBe(3600);
    expect(c.tokens!.scope).toBe("quiz:read quiz:write");
    const stored = await prisma.oAuthToken.findMany();
    expect(stored).toHaveLength(2);
    expect(stored.map((s) => s.tokenHash)).toContain(sha256(c.tokens!.access_token));
    expect(JSON.stringify(stored)).not.toContain(c.tokens!.access_token);
  });

  it("code_challenge_method S256 dan boshqasi qabul qilinmaydi", async () => {
    const reg = await registerClient(app);
    const r = await request(app).get("/oauth/authorize").query({
      response_type: "code",
      client_id: reg.body.client_id,
      redirect_uri: REDIRECT,
      code_challenge: "abc",
      code_challenge_method: "plain",
    });
    expect(r.status).toBe(302);
    expect(new URL(r.headers.location).searchParams.get("error")).toBe("invalid_request");
  });

  it("ro'yxatdan o'tmagan redirect_uri bilan authorize rad etiladi", async () => {
    const reg = await registerClient(app);
    const { challenge } = pkce();
    const r = await request(app).get("/oauth/authorize").query({
      response_type: "code",
      client_id: reg.body.client_id,
      redirect_uri: "http://localhost:9999/boshqa",
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    expect(r.status).toBe(400);
    expect(await prisma.oAuthAuthRequest.count()).toBe(0);
  });

  it("noto'g'ri code_verifier rad etiladi, code esa yonmaydi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const reg = await registerClient(app);
    const { challenge } = pkce();
    const auth = await request(app).get("/oauth/authorize").query({
      response_type: "code", client_id: reg.body.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256",
    });
    const reqToken = new URL(auth.headers.location).searchParams.get("req")!;
    const d = await request(app).post("/api/oauth/consent/decision").set("Authorization", `Bearer ${t.jwt}`).send({ req: reqToken, approve: true });
    const code = new URL(d.body.redirectUrl).searchParams.get("code")!;
    const bad = await request(app).post("/oauth/token").type("form")
      .send({ grant_type: "authorization_code", code, code_verifier: "x".repeat(43), client_id: reg.body.client_id });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe("invalid_grant");
    expect(await prisma.oAuthToken.count()).toBe(0);
  });

  it("code ikkinchi marta ishlatilsa rad etiladi va ruxsat bekor qilinadi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    const again = await request(app).post("/oauth/token").type("form")
      .send({ grant_type: "authorization_code", code: c.code, code_verifier: c.verifier, client_id: c.clientId });
    expect(again.status).toBe(400);
    const grant = await prisma.oAuthGrant.findFirstOrThrow();
    expect(grant.revokedAt).not.toBeNull();
    const live = await prisma.oAuthToken.count({ where: { revokedAt: null } });
    expect(live).toBe(0);
  });

  it("ruxsat so'rovi faqat bir marta hal qilinadi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    const again = await request(app).post("/api/oauth/consent/decision").set("Authorization", `Bearer ${t.jwt}`).send({ req: c.reqToken, approve: true });
    expect(again.status).toBe(404);
  });

  it("rad etilsa access_denied bilan qaytadi, token berilmaydi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt, { approve: false });
    expect(c.back.searchParams.get("error")).toBe("access_denied");
    expect(c.back.searchParams.get("state")).toBe("st-123");
    expect(c.code).toBeNull();
    expect(await prisma.oAuthGrant.count()).toBe(0);
  });

  it("ruxsat sahifasi login talab qiladi", async () => {
    const r = await request(app).get("/api/oauth/consent").query({ req: "rqq_x" });
    expect(r.status).toBe(401);
  });
});

describe("Kimga qanday ruxsat beriladi", () => {
  it("canCreate'siz ustoz faqat quiz:read oladi", async () => {
    const t = await makeTeacher({ canCreate: false });
    const c = await connect(app, t.jwt);
    expect(c.info.body.readOnlyDowngrade).toBe(true);
    expect(c.info.body.granted.map((g: { scope: string }) => g.scope)).toEqual(["quiz:read"]);
    expect(c.tokens!.scope).toBe("quiz:read");
  });

  it("tasdiqlanmagan foydalanuvchiga ruxsat berilmaydi", async () => {
    const t = await makeTeacher({ approved: false, canCreate: true });
    const c = await connect(app, t.jwt);
    expect(c.info.body.eligible).toBe(false);
    expect(c.back.searchParams.get("error")).toBe("access_denied");
    expect(c.tokens).toBeNull();
  });

  it("uy vazifa bilan bloklangan ustoz ruxsat sahifasiga kira olmaydi", async () => {
    const t = await makeTeacher({ canCreate: true, hwStrikes: 3 });
    const reg = await registerClient(app);
    const { challenge } = pkce();
    const auth = await request(app).get("/oauth/authorize").query({
      response_type: "code", client_id: reg.body.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256",
    });
    const reqToken = new URL(auth.headers.location).searchParams.get("req")!;
    const r = await request(app).get("/api/oauth/consent").query({ req: reqToken }).set("Authorization", `Bearer ${t.jwt}`);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe("HW_BLOCKED");
  });
});

describe("Refresh token rotation", () => {
  it("refresh yangi juftlik beradi; eskisi qayta kelsa butun zanjir bekor", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    const r1 = await request(app).post("/oauth/token").type("form")
      .send({ grant_type: "refresh_token", refresh_token: c.tokens!.refresh_token, client_id: c.clientId });
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(c.tokens!.refresh_token);

    const reuse = await request(app).post("/oauth/token").type("form")
      .send({ grant_type: "refresh_token", refresh_token: c.tokens!.refresh_token, client_id: c.clientId });
    expect(reuse.status).toBe(400);

    // Yangi berilgan refresh ham endi ishlamaydi (zanjir bekor)
    const r2 = await request(app).post("/oauth/token").type("form")
      .send({ grant_type: "refresh_token", refresh_token: r1.body.refresh_token, client_id: c.clientId });
    expect(r2.status).toBe(400);
  });

  it("boshqa client nomidan refresh qilib bo'lmaydi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    const other = await registerClient(app);
    const r = await request(app).post("/oauth/token").type("form")
      .send({ grant_type: "refresh_token", refresh_token: c.tokens!.refresh_token, client_id: other.body.client_id });
    expect(r.status).toBe(400);
  });

  it("confidential client secret'siz token ololmaydi", async () => {
    const reg = await request(app).post("/oauth/register")
      .send({ client_name: "Conf", redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post" });
    const r = await request(app).post("/oauth/token").type("form")
      .send({ grant_type: "refresh_token", refresh_token: "rqr_x", client_id: reg.body.client_id });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_client");
    const wrong = await request(app).post("/oauth/token").type("form")
      .send({ grant_type: "refresh_token", refresh_token: "rqr_x", client_id: reg.body.client_id, client_secret: "noto'g'ri" });
    expect(wrong.body.error).toBe("invalid_client");
  });
});

describe("Ulangan ilovalar", () => {
  it("ro'yxatda ko'rinadi, bekor qilinsa tokenlar ham bekor; boshqaning ruxsatini bekor qilib bo'lmaydi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const other = await makeTeacher({ canCreate: true });
    await connect(app, t.jwt);
    const list = await request(app).get("/api/oauth/grants").set("Authorization", `Bearer ${t.jwt}`);
    expect(list.body.grants).toHaveLength(1);
    const id = list.body.grants[0].id;

    const foreign = await request(app).delete(`/api/oauth/grants/${id}`).set("Authorization", `Bearer ${other.jwt}`);
    expect(foreign.status).toBe(404);

    const del = await request(app).delete(`/api/oauth/grants/${id}`).set("Authorization", `Bearer ${t.jwt}`);
    expect(del.status).toBe(200);
    expect(await prisma.oAuthToken.count({ where: { revokedAt: null } })).toBe(0);
    const after = await request(app).get("/api/oauth/grants").set("Authorization", `Bearer ${t.jwt}`);
    expect(after.body.grants).toHaveLength(0);
  });

  it("admin istalgan foydalanuvchining ruxsatini bekor qiladi; oddiy ustoz qila olmaydi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const admin = await makeTeacher({ isAdmin: true });
    await connect(app, t.jwt);
    const grant = await prisma.oAuthGrant.findFirstOrThrow();
    const notAdmin = await request(app).get(`/api/oauth/admin/users/${t.id}/grants`).set("Authorization", `Bearer ${t.jwt}`);
    expect(notAdmin.status).toBe(403);
    const list = await request(app).get(`/api/oauth/admin/users/${t.id}/grants`).set("Authorization", `Bearer ${admin.jwt}`);
    expect(list.body.grants).toHaveLength(1);
    const del = await request(app).delete(`/api/oauth/admin/grants/${grant.id}`).set("Authorization", `Bearer ${admin.jwt}`);
    expect(del.status).toBe(200);
    const g = await prisma.oAuthGrant.findUniqueOrThrow({ where: { id: grant.id } });
    expect(g.revokedBy).toBe(admin.id);
  });

  it("ruxsat berish audit log'ga yoziladi (token'siz)", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    let rows: Awaited<ReturnType<typeof prisma.auditLog.findMany>> = [];
    for (let i = 0; i < 20 && rows.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 50));
      rows = await prisma.auditLog.findMany({ where: { action: "oauth.consent.approve" } });
    }
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBe(t.id);
    expect(JSON.stringify(rows)).not.toContain(c.reqToken);
    expect(JSON.stringify(rows)).not.toContain(c.code!);
  });
});
