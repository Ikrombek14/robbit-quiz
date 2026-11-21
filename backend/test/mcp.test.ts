import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { prisma } from "../src/prisma.js";
import { HW_BLOCKED_MESSAGE } from "../src/services/hwGate.js";
import { buildApp, listen, resetDb, makeTeacher, makeQuiz, connect } from "./helpers.js";

const app = buildApp();
let srv: { url: string; close: () => Promise<void> };

beforeAll(async () => {
  srv = await listen(app);
});
beforeEach(resetDb);
afterAll(async () => {
  await srv.close();
  await prisma.$disconnect();
});

async function mcpClient(accessToken: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${srv.url}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  await client.connect(transport);
  return client;
}

function json(r: any) {
  return JSON.parse(r.content[0].text);
}

describe("/mcp autentifikatsiya", () => {
  it("tokensiz so'rov 401 + WWW-Authenticate resource_metadata", async () => {
    const r = await request(app).post("/mcp").send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(r.status).toBe(401);
    expect(r.headers["www-authenticate"]).toContain(
      'resource_metadata="http://localhost:4000/.well-known/oauth-protected-resource"',
    );
  });

  it("yaroqsiz va muddati o'tgan token rad etiladi", async () => {
    const bad = await request(app).post("/mcp").set("Authorization", "Bearer rqa_soxta").send({});
    expect(bad.status).toBe(401);

    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    await prisma.oAuthToken.updateMany({ where: { kind: "ACCESS" }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const exp = await request(app).post("/mcp").set("Authorization", `Bearer ${c.tokens!.access_token}`).send({});
    expect(exp.status).toBe(401);
  });

  it("ruxsat bekor qilingach token ishlamaydi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    const client = await mcpClient(c.tokens!.access_token);
    await client.close();
    const grant = await prisma.oAuthGrant.findFirstOrThrow();
    await request(app).delete(`/api/oauth/grants/${grant.id}`).set("Authorization", `Bearer ${t.jwt}`);
    await expect(mcpClient(c.tokens!.access_token)).rejects.toThrow();
  });
});

describe("O'qish tool'lari", () => {
  it("tool'lar ro'yxati va readOnlyHint annotatsiyasi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    const client = await mcpClient(c.tokens!.access_token);
    const { tools } = await client.listTools();
    expect(tools.map((x) => x.name).sort()).toEqual(["get_quiz", "get_slide", "list_folders", "list_quizzes"]);
    for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
    await client.close();
  });

  it("faqat o'z quizlari ko'rinadi; birovning quizi topilmaydi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const other = await makeTeacher({ canCreate: true });
    const mine = await makeQuiz(t.id, "Python 2-dars", 3);
    const theirs = await makeQuiz(other.id, "Begona quiz");
    const c = await connect(app, t.jwt);
    const client = await mcpClient(c.tokens!.access_token);

    const list = json(await client.callTool({ name: "list_quizzes", arguments: {} }));
    expect(list.quizzes.map((q: any) => q.id)).toEqual([mine.id]);
    expect(list.quizzes[0].canEdit).toBe(true);

    const search = json(await client.callTool({ name: "list_quizzes", arguments: { query: "python" } }));
    expect(search.quizzes).toHaveLength(1);

    const q = json(await client.callTool({ name: "get_quiz", arguments: { quizId: mine.id } }));
    expect(q.slideCount).toBe(3);
    expect(q.slides[1]).toMatchObject({ id: mine.slides[1].id, position: 2, kind: "QUESTION", type: "SINGLE", title: "Python 2-dars savol 2" });

    const foreign = await client.callTool({ name: "get_quiz", arguments: { quizId: theirs.id } });
    expect(foreign.isError).toBe(true);

    const s = json(await client.callTool({ name: "get_slide", arguments: { quizId: mine.id, slideId: mine.slides[0].id } }));
    expect(s.position).toBe(1);
    expect(s.data.options).toHaveLength(2);
    await client.close();
  });

  it("o'quv dasturga biriktirilgan quizni har qanday ustoz ko'radi", async () => {
    const owner = await makeTeacher({ canCreate: true });
    const reader = await makeTeacher({ canCreate: false });
    const quiz = await makeQuiz(owner.id, "Umumiy dars");
    await prisma.lessonPlan.create({ data: { subject: "DASTURLASH", ageGroup: "MIDDLE", year: 1, title: "Dars", quizId: quiz.id } });
    const c = await connect(app, reader.jwt);
    const client = await mcpClient(c.tokens!.access_token);
    const list = json(await client.callTool({ name: "list_quizzes", arguments: { source: "curriculum" } }));
    expect(list.quizzes.map((q: any) => q.id)).toEqual([quiz.id]);
    expect(list.quizzes[0].canEdit).toBe(false); // faqat quiz:read
    const q = json(await client.callTool({ name: "get_quiz", arguments: { quizId: quiz.id } }));
    expect(q.canEdit).toBe(false);
    await client.close();
  });

  it("admin barcha quizlarni ko'radi", async () => {
    const admin = await makeTeacher({ isAdmin: true, approved: false });
    const other = await makeTeacher();
    await makeQuiz(other.id, "Kimningdir quizi");
    const c = await connect(app, admin.jwt);
    const client = await mcpClient(c.tokens!.access_token);
    const list = json(await client.callTool({ name: "list_quizzes", arguments: {} }));
    expect(list.quizzes).toHaveLength(1);
    expect(list.quizzes[0].owner).toBe(other.name);
    await client.close();
  });
});

describe("Har chaqiruvda huquq qayta tekshiriladi", () => {
  it("uy vazifa bloki MCP'da ham ishlaydi (xabar bir xil)", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    const client = await mcpClient(c.tokens!.access_token);
    await prisma.teacher.update({ where: { id: t.id }, data: { hwStrikes: 3 } });
    const r: any = await client.callTool({ name: "list_quizzes", arguments: {} });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toBe(HW_BLOCKED_MESSAGE);
    // admin vaqtincha ochsa — yana ishlaydi
    await prisma.teacher.update({ where: { id: t.id }, data: { hwUnlockUntil: new Date(Date.now() + 3600_000) } });
    const r2: any = await client.callTool({ name: "list_quizzes", arguments: {} });
    expect(r2.isError).toBeFalsy();
    await client.close();
  });

  it("ustozlik huquqi olinsa darhol ishlamay qoladi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    const client = await mcpClient(c.tokens!.access_token);
    await prisma.teacher.update({ where: { id: t.id }, data: { approved: false } });
    const r: any = await client.callTool({ name: "list_folders", arguments: {} });
    expect(r.isError).toBe(true);
    await client.close();
  });

  it("canCreate olinsa token'dagi yozish scope'lari ham kesiladi (refresh'da)", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    await prisma.teacher.update({ where: { id: t.id }, data: { canCreate: false } });
    const r = await request(app).post("/oauth/token").type("form")
      .send({ grant_type: "refresh_token", refresh_token: c.tokens!.refresh_token, client_id: c.clientId });
    expect(r.status).toBe(200);
    expect(r.body.scope).toBe("quiz:read");
  });
});
