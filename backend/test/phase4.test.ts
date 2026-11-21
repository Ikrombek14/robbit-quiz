import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { prisma } from "../src/prisma.js";
import { UPLOADS_DIR } from "../src/routes/upload.js";
import { isLoopbackRedirect } from "../src/mcp/security.js";
import { buildApp, listen, resetDb, makeTeacher, makeQuiz, connect } from "./helpers.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const app = buildApp();
let srv: { url: string; close: () => Promise<void> };
const clients: Client[] = [];
const written: string[] = [];

beforeAll(async () => {
  srv = await listen(app);
});
beforeEach(resetDb);
afterAll(async () => {
  for (const c of clients) await c.close().catch(() => {});
  for (const f of written) fs.rmSync(path.join(UPLOADS_DIR, path.basename(f)), { force: true });
  await srv.close();
  await prisma.$disconnect();
});

async function mcp(accessToken: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${srv.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${accessToken}` } } }),
  );
  clients.push(client);
  const call = async (name: string, args: Record<string, unknown>) => {
    const r: any = await client.callTool({ name, arguments: args });
    return { error: r.isError ? (r.content[0].text as string) : null, data: r.isError ? null : JSON.parse(r.content[0].text) };
  };
  const apply = async (name: string, args: Record<string, unknown>) => {
    const p = await call(name, args);
    if (p.error) return p;
    return call("confirm_action", { actionId: p.data.actionId });
  };
  return { call, apply };
}

async function teacherClient(over: Parameters<typeof makeTeacher>[0] = { canCreate: true }) {
  const t = await makeTeacher(over);
  const c = await connect(app, t.jwt);
  return { t, m: await mcp(c.tokens!.access_token) };
}

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3d6e2a10000000049454e44ae426082",
  "hex",
);

describe("list_lessons", () => {
  it("katalog bo'yicha darslar, quiz tarkibi va missing filtri", async () => {
    const { t, m } = await teacherClient();
    const withQ = await makeQuiz(t.id, "Savolli", 2); // makeQuiz — savol slaydlari
    const contentOnly = await prisma.quiz.create({
      data: { title: "Faqat kontent", teacherId: t.id, slides: { create: [{ order: 0, kind: "CONTENT", data: JSON.stringify({ title: "A", body: "", imageUrl: "/uploads/a.png" }) }] } },
    });
    await prisma.lessonPlan.createMany({
      data: [
        { subject: "DASTURLASH", ageGroup: "MIDDLE", year: 1, order: 1, title: "1-dars: o'zgaruvchilar", quizId: withQ.id },
        { subject: "DASTURLASH", ageGroup: "MIDDLE", year: 1, order: 2, title: "2-dars: sikllar", quizId: contentOnly.id },
        { subject: "DASTURLASH", ageGroup: "MIDDLE", year: 1, order: 3, title: "3-dars: funksiyalar" },
        { subject: "DASTURLASH", ageGroup: "MIDDLE", year: 1, order: 4, title: "4-dars: o'chirilgan quiz", quizId: "yoq-quiz" },
      ],
    });
    await prisma.workshop.create({ data: { title: "Robot yig'ish" } });

    const all = await m.call("list_lessons", {});
    expect(all.data.total).toBe(5);
    const byTitle = new Map(all.data.lessons.map((l: any) => [l.title, l]));
    expect((byTitle.get("1-dars: o'zgaruvchilar") as any).quiz).toMatchObject({ id: withQ.id, questionSlides: 2, contentSlides: 0 });
    expect((byTitle.get("2-dars: sikllar") as any).quiz).toMatchObject({ contentSlides: 1, questionSlides: 0 });
    expect((byTitle.get("1-dars: o'zgaruvchilar") as any).group).toContain("Dasturlash");

    const noQuiz = await m.call("list_lessons", { missing: "quiz" });
    expect(noQuiz.data.lessons.map((l: any) => l.title).sort()).toEqual(["3-dars: funksiyalar", "4-dars: o'chirilgan quiz", "Robot yig'ish"]);

    const noQuestions = await m.call("list_lessons", { missing: "questions", catalog: "curriculum" });
    expect(noQuestions.data.lessons.map((l: any) => l.title)).toEqual(["2-dars: sikllar"]);

    const search = await m.call("list_lessons", { query: "SIKL" });
    expect(search.data.lessons).toHaveLength(1);
  });

  it("faqat o'qish ruxsatli ulanishda ham ko'rinadi, lekin biriktirish tool'i yo'q", async () => {
    const t = await makeTeacher({ canCreate: false });
    const c = await connect(app, t.jwt);
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${srv.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${c.tokens!.access_token}` } } }));
    clients.push(client);
    const names = (await client.listTools()).tools.map((x) => x.name);
    expect(names).toContain("list_lessons");
    expect(names).not.toContain("attach_quiz_to_lesson");
    expect(names).not.toContain("create_image_upload");
  });
});

describe("attach_quiz_to_lesson", () => {
  it("bo'sh darsga biriktiradi; band darsni almashtirmaydi", async () => {
    const { t, m } = await teacherClient();
    const q1 = await makeQuiz(t.id, "Yangi dars", 1);
    const q2 = await makeQuiz(t.id, "Boshqa", 1);
    const empty = await prisma.lessonPlan.create({ data: { subject: "DASTURLASH", ageGroup: "JUNIOR", year: 1, title: "Bo'sh dars" } });
    const busy = await prisma.newCurriculumLesson.create({ data: { module: "1-oy", title: "Band dars", quizId: q2.id } });

    const p = await m.call("attach_quiz_to_lesson", { catalog: "curriculum", lessonId: empty.id, quizId: q1.id });
    expect(p.data.preview).toContain("Bo'sh dars");
    expect((await prisma.lessonPlan.findUnique({ where: { id: empty.id } }))!.quizId).toBeNull(); // hali saqlanmagan
    const done = await m.call("confirm_action", { actionId: p.data.actionId });
    expect(done.error).toBeNull();
    expect((await prisma.lessonPlan.findUnique({ where: { id: empty.id } }))!.quizId).toBe(q1.id);

    const refused = await m.call("attach_quiz_to_lesson", { catalog: "new_curriculum", lessonId: busy.id, quizId: q1.id });
    expect(refused.error).toContain("allaqachon «Boshqa» biriktirilgan");
    expect((await prisma.newCurriculumLesson.findUnique({ where: { id: busy.id } }))!.quizId).toBe(q2.id);
  });

  it("taklif va tasdiq orasida darsga boshqa quiz biriktirilsa — bajarilmaydi", async () => {
    const { t, m } = await teacherClient();
    const q1 = await makeQuiz(t.id, "A", 1);
    const q2 = await makeQuiz(t.id, "B", 1);
    const lesson = await prisma.workshop.create({ data: { title: "W" } });
    const p = await m.call("attach_quiz_to_lesson", { catalog: "workshop", lessonId: lesson.id, quizId: q1.id });
    await prisma.workshop.update({ where: { id: lesson.id }, data: { quizId: q2.id } }); // platformada
    const r = await m.call("confirm_action", { actionId: p.data.actionId });
    expect(r.error).toContain("boshqa quiz biriktirildi");
    expect((await prisma.workshop.findUnique({ where: { id: lesson.id } }))!.quizId).toBe(q2.id);
  });

  it("o'chirilgan quizga ishora qiluvchi dars bo'sh hisoblanadi", async () => {
    const { t, m } = await teacherClient();
    const q = await makeQuiz(t.id, "Yangi", 1);
    const lesson = await prisma.extraLesson.create({ data: { title: "Eski", quizId: "ochirilgan-id" } });
    const r = await m.apply("attach_quiz_to_lesson", { catalog: "extra", lessonId: lesson.id, quizId: q.id });
    expect(r.error).toBeNull();
    expect((await prisma.extraLesson.findUnique({ where: { id: lesson.id } }))!.quizId).toBe(q.id);
  });

  it("birovning quizini biriktirib bo'lmaydi", async () => {
    const { m } = await teacherClient();
    const other = await makeTeacher({ canCreate: true });
    const foreign = await makeQuiz(other.id, "Begona", 1);
    const lesson = await prisma.workshop.create({ data: { title: "W" } });
    const r = await m.call("attach_quiz_to_lesson", { catalog: "workshop", lessonId: lesson.id, quizId: foreign.id });
    expect(r.error).toBeTruthy();
  });
});

describe("add_slides va sahifa slaydlari", () => {
  it("bir nechta slayd — bitta tasdiq, to'g'ri o'rinlarda, bitta versiya", async () => {
    const { t, m } = await teacherClient();
    const quiz = await makeQuiz(t.id, "Dars", 2);
    const r = await m.apply("add_slides", {
      quizId: quiz.id,
      quizVersion: 1,
      position: 2,
      slides: [
        { kind: "CONTENT", title: "Sahifa 1", pageImageUrl: "/uploads/p1.png" },
        { kind: "QUESTION", type: "TRUE_FALSE", text: "Python — dasturlash tili", statementIsTrue: true },
      ],
    });
    expect(r.error).toBeNull();
    expect(r.data.slideIds).toHaveLength(2);
    expect(r.data.quizVersion).toBe(2);
    const slides = await prisma.slide.findMany({ where: { quizId: quiz.id }, orderBy: { order: "asc" } });
    expect(slides.map((s) => s.kind)).toEqual(["QUESTION", "CONTENT", "QUESTION", "QUESTION"]);
    // PDF import bilan bir xil format: rasm butun kanvasni egallaydi
    expect(JSON.parse(slides[1].data)).toEqual({ title: "Sahifa 1", body: "", imageUrl: "/uploads/p1.png" });
    expect(await prisma.quizRevision.count({ where: { quizId: quiz.id } })).toBe(1);
  });

  it("bitta slayd xato bo'lsa — hech biri qo'shilmaydi (xatoda slayd raqami)", async () => {
    const { t, m } = await teacherClient();
    const quiz = await makeQuiz(t.id, "Dars", 1);
    const r = await m.call("add_slides", {
      quizId: quiz.id,
      quizVersion: 1,
      slides: [
        { kind: "CONTENT", pageImageUrl: "/uploads/ok.png" },
        { kind: "QUESTION", type: "SINGLE", text: "?", options: [{ text: "a", correct: true }, { text: "b", correct: true }] },
      ],
    });
    expect(r.error).toContain("2-slayd");
    expect(await prisma.slide.count({ where: { quizId: quiz.id } })).toBe(1);
  });

  it("pageImageUrl qoidalari", async () => {
    const { t, m } = await teacherClient();
    const quiz = await makeQuiz(t.id, "Dars", 1);
    const bad = async (slide: any) => (await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide })).error;
    expect(await bad({ kind: "CONTENT", pageImageUrl: "/uploads/a.png", body: "matn" })).toContain("pageImageUrl bilan");
    expect(await bad({ kind: "CONTENT", pageImageUrl: "http://example.com/a.png" })).toContain("https");
    expect(await bad({ kind: "QUESTION", type: "OPEN", text: "?", pageImageUrl: "/uploads/a.png" })).toContain("faqat CONTENT");
  });

  it("sahifa slaydining rasmini update_slide bilan almashtirish (xato slaydni tuzatish)", async () => {
    const { t, m } = await teacherClient();
    const quiz = await makeQuiz(t.id, "Dars", 0);
    const add = await m.apply("add_slide", { quizId: quiz.id, quizVersion: 1, slide: { kind: "CONTENT", title: "Sahifa 1", pageImageUrl: "/uploads/old.png" } });
    const r = await m.apply("update_slide", { quizId: quiz.id, quizVersion: 2, slideId: add.data.slideId, changes: { imageUrl: "/uploads/new.png" } });
    expect(r.error).toBeNull();
    const s = await prisma.slide.findUniqueOrThrow({ where: { id: add.data.slideId } });
    expect(JSON.parse(s.data)).toEqual({ title: "Sahifa 1", body: "", imageUrl: "/uploads/new.png" });
  });
});

describe("create_image_upload", () => {
  async function link(m: Awaited<ReturnType<typeof mcp>>) {
    const r = await m.call("create_image_upload", {});
    expect(r.error).toBeNull();
    return new URL(r.data.uploadUrl).pathname;
  }

  it("PNG yuklanadi va /uploads/... qaytadi", async () => {
    const { m } = await teacherClient();
    const p = await link(m);
    const r = await request(app).post(p).attach("file", PNG, "slide.png");
    expect(r.status).toBe(200);
    expect(r.body.url).toMatch(/^\/uploads\/\d+-[0-9a-f]{12}\.png$/);
    written.push(r.body.url);
    expect(fs.existsSync(path.join(UPLOADS_DIR, path.basename(r.body.url)))).toBe(true);
  });

  it("rasm bo'lmagan fayl (kengaytmasi .png bo'lsa ham) rad etiladi", async () => {
    const { m } = await teacherClient();
    const p = await link(m);
    const r = await request(app).post(p).attach("file", Buffer.from("<script>alert(1)</script>"), "x.png");
    expect(r.status).toBe(400);
  });

  it("soxta yoki o'zgartirilgan havola ishlamaydi", async () => {
    const { m } = await teacherClient();
    const p = await link(m);
    const tampered = p.slice(0, -3) + (p.endsWith("AAA") ? "BBB" : "AAA");
    expect((await request(app).post(tampered).attach("file", PNG, "a.png")).status).toBe(401);
    expect((await request(app).post("/mcp-upload/rqu_soxta.token").attach("file", PNG, "a.png")).status).toBe(401);
  });

  it("ruxsat bekor qilinsa yoki slayd huquqi olinsa havola ishlamaydi", async () => {
    const { t, m } = await teacherClient();
    const p = await link(m);
    await prisma.teacher.update({ where: { id: t.id }, data: { canCreate: false } });
    expect((await request(app).post(p).attach("file", PNG, "a.png")).status).toBe(403);
    await prisma.teacher.update({ where: { id: t.id }, data: { canCreate: true } });
    await prisma.oAuthGrant.updateMany({ data: { revokedAt: new Date() } });
    expect((await request(app).post(p).attach("file", PNG, "a.png")).status).toBe(403);
  });
});

describe("Kompyuterdagi ilovalar (loopback redirect)", () => {
  it("faqat http://localhost|127.0.0.1|[::1]", () => {
    expect(isLoopbackRedirect("http://localhost:53682/callback")).toBe(true);
    expect(isLoopbackRedirect("http://127.0.0.1:9000/cb")).toBe(true);
    expect(isLoopbackRedirect("http://[::1]:9000/cb")).toBe(true);
    expect(isLoopbackRedirect("https://localhost/cb")).toBe(false);
    expect(isLoopbackRedirect("http://localhost.evil.com/cb")).toBe(false);
    expect(isLoopbackRedirect("http://user:p@localhost/cb")).toBe(false);
    expect(isLoopbackRedirect("http://evil.com/cb")).toBe(false);
  });

  it("rozilik sahifasi kompyuterdagi ilovani belgilaydi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt); // helpers: http://localhost:6274/oauth/callback
    expect(c.info.status).toBe(200);
    expect(c.info.body.client.localApp).toBe(true);
  });
});
