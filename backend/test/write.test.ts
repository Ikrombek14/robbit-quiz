import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { prisma } from "../src/prisma.js";
import { HW_BLOCKED_MESSAGE } from "../src/services/hwGate.js";
import { buildApp, listen, resetDb, makeTeacher, makeQuiz, connect } from "./helpers.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const app = buildApp();
let srv: { url: string; close: () => Promise<void> };
const clients: Client[] = [];

beforeAll(async () => {
  srv = await listen(app);
});
beforeEach(resetDb);
afterAll(async () => {
  for (const c of clients) await c.close().catch(() => {});
  await srv.close();
  await prisma.$disconnect();
});

async function mcp(accessToken: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${srv.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${accessToken}` } } }),
  );
  clients.push(client);
  return {
    async call(name: string, args: Record<string, unknown>) {
      const r: any = await client.callTool({ name, arguments: args });
      return { error: r.isError ? (r.content[0].text as string) : null, data: r.isError ? null : JSON.parse(r.content[0].text) };
    },
  };
}

async function setup(over: Parameters<typeof makeTeacher>[0] = {}) {
  const t = await makeTeacher({ canCreate: true, ...over });
  const quiz = await makeQuiz(t.id, "Python 2-dars", 3);
  const c = await connect(app, t.jwt);
  return { t, quiz, c, m: await mcp(c.tokens!.access_token) };
}

const single = (text = "2 + 2 nechiga teng?") => ({
  kind: "QUESTION",
  type: "SINGLE",
  text,
  options: [{ text: "3" }, { text: "4", correct: true }, { text: "5" }],
});

const state = async (quizId: string) => {
  const q = await prisma.quiz.findUniqueOrThrow({ where: { id: quizId }, include: { slides: { orderBy: { order: "asc" } } } });
  return { version: q.version, ids: q.slides.map((s) => s.id), slides: q.slides.map((s) => ({ ...s, data: JSON.parse(s.data) })), revisions: await prisma.quizRevision.count({ where: { quizId } }) };
};

describe("Taklif bosqichi hech narsani saqlamaydi", () => {
  it("add_slide: baza o'zgarmaydi, preview va actionId qaytadi", async () => {
    const { quiz, m } = await setup();
    const before = await state(quiz.id);
    const r = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, position: 2, slide: single() });
    expect(r.error).toBeNull();
    expect(r.data.status).toBe("confirmation_required");
    expect(r.data.actionId).toMatch(/^rqx_/);
    expect(r.data.preview).toContain("2 + 2 nechiga teng?");
    expect(r.data.preview).toContain("B) 4 ✓");
    expect(r.data.preview).toContain("1-slayddan keyin");
    expect(await state(quiz.id)).toEqual(before);
    const row = await prisma.mcpPendingAction.findFirstOrThrow();
    expect(row.actionHash).not.toBe(r.data.actionId); // faqat hash
  });

  it("confirm_action'siz hech qachon saqlanmaydi; tasdiqdan keyin aynan shu o'ringa qo'shiladi", async () => {
    const { quiz, m } = await setup();
    const before = await state(quiz.id);
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, position: 2, slide: single() });
    const done = await m.call("confirm_action", { actionId: p.data.actionId });
    expect(done.error).toBeNull();
    expect(done.data).toMatchObject({ status: "done", position: 2, quizVersion: 2 });
    const after = await state(quiz.id);
    expect(after.ids).toHaveLength(4);
    expect(after.ids[1]).toBe(done.data.slideId);
    // boshqa slaydlar id'lari o'zgarmagan
    expect([after.ids[0], after.ids[2], after.ids[3]]).toEqual(before.ids);
    expect(after.slides[1].data.options[1]).toEqual({ text: "4", isCorrect: true });
    expect(after.version).toBe(2);
    const rev = await prisma.quizRevision.findFirstOrThrow({ where: { quizId: quiz.id } });
    expect(rev).toMatchObject({ version: 1, source: "mcp" });
    expect((rev.snapshot as any).slides).toHaveLength(3);
  });

  it("actionId ikkinchi marta ishlatilmaydi", async () => {
    const { quiz, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    await m.call("confirm_action", { actionId: p.data.actionId });
    const again = await m.call("confirm_action", { actionId: p.data.actionId });
    expect(again.error).toContain("allaqachon bajarilgan");
    expect((await state(quiz.id)).ids).toHaveLength(4);
  });

  it("cancel_action: bekor qilingan amalni tasdiqlab bo'lmaydi", async () => {
    const { quiz, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    const c = await m.call("cancel_action", { actionId: p.data.actionId });
    expect(c.data.status).toBe("cancelled");
    const conf = await m.call("confirm_action", { actionId: p.data.actionId });
    expect(conf.error).toContain("bekor qilingan");
    expect((await state(quiz.id)).ids).toHaveLength(3);
  });

  it("muddati o'tgan amal bajarilmaydi", async () => {
    const { quiz, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    await prisma.mcpPendingAction.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const conf = await m.call("confirm_action", { actionId: p.data.actionId });
    expect(conf.error).toContain("muddati o'tgan");
    expect((await prisma.mcpPendingAction.findFirstOrThrow()).status).toBe("EXPIRED");
    expect((await state(quiz.id)).ids).toHaveLength(3);
  });

  it("boshqa foydalanuvchi yoki boshqa ilova (grant) tasdiqlay olmaydi", async () => {
    const { quiz, t, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    const other = await makeTeacher({ canCreate: true });
    const oc = await connect(app, other.jwt);
    const om = await mcp(oc.tokens!.access_token);
    expect((await om.call("confirm_action", { actionId: p.data.actionId })).error).toBe("Amal topilmadi.");
    // o'sha ustoz, lekin boshqa ulanish (boshqa client/grant)
    const sc = await connect(app, t.jwt);
    const sm = await mcp(sc.tokens!.access_token);
    expect((await sm.call("confirm_action", { actionId: p.data.actionId })).error).toBe("Amal topilmadi.");
    expect((await state(quiz.id)).ids).toHaveLength(3);
    // asl ulanish hali ham tasdiqlay oladi
    expect((await m.call("confirm_action", { actionId: p.data.actionId })).error).toBeNull();
  });

  it("taklifdagi eski versiya darhol rad etiladi", async () => {
    const { quiz, m } = await setup();
    const r = await m.call("add_slide", { quizId: quiz.id, quizVersion: 7, slide: single() });
    expect(r.error).toContain("versiyasi o'zgargan");
    expect(await prisma.mcpPendingAction.count()).toBe(0);
  });

  it("bir vaqtda ko'pi bilan 20 ta kutilayotgan amal", async () => {
    const { quiz, t, m } = await setup();
    await prisma.mcpPendingAction.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        actionHash: `h${i}`, teacherId: t.id, grantId: "g", clientId: "c", tool: "add_slide", params: {}, summary: "x", preview: "x",
        expiresAt: new Date(Date.now() + 600_000),
      })),
    });
    const r = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    expect(r.error).toContain("juda ko'p");
  });
});

describe("Muharrir bilan konflikt (quiz versiyasi)", () => {
  it("taklif va tasdiq orasida muharrirda saqlansa — amal bajarilmaydi", async () => {
    const { quiz, t, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    const put = await request(app).put(`/api/quizzes/${quiz.id}`).set("Authorization", `Bearer ${t.jwt}`).send({
      title: "Yangi nom", version: 1, slides: [{ kind: "QUESTION", type: "OPEN", data: { text: "?", answers: ["a"] } }],
    });
    expect(put.status).toBe(200);
    const conf = await m.call("confirm_action", { actionId: p.data.actionId });
    expect(conf.error).toContain("boshqa joyda o'zgartirildi");
    const s = await state(quiz.id);
    expect(s.ids).toHaveLength(1);
    expect((await prisma.mcpPendingAction.findFirstOrThrow()).status).toBe("FAILED");
  });

  it("muharrir eski versiya bilan saqlasa 409, ma'lumot o'zgarmaydi", async () => {
    const { quiz, t, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    await m.call("confirm_action", { actionId: p.data.actionId }); // version 2
    const put = await request(app).put(`/api/quizzes/${quiz.id}`).set("Authorization", `Bearer ${t.jwt}`).send({
      title: "Eski nusxa", version: 1, slides: [],
    });
    expect(put.status).toBe(409);
    expect(put.body.code).toBe("VERSION_CONFLICT");
    expect(put.body.currentVersion).toBe(2);
    expect((await state(quiz.id)).ids).toHaveLength(4);
  });

  it("to'g'ri versiya bilan saqlash ishlaydi, tarixga 'editor' yoziladi; GET version beradi", async () => {
    const { quiz, t } = await setup();
    const g = await request(app).get(`/api/quizzes/${quiz.id}`).set("Authorization", `Bearer ${t.jwt}`);
    expect(g.body.quiz.version).toBe(1);
    expect(g.body.quiz.canRestore).toBe(true);
    const put = await request(app).put(`/api/quizzes/${quiz.id}`).set("Authorization", `Bearer ${t.jwt}`).send({
      title: "Yangi", version: 1, slides: g.body.quiz.slides,
    });
    expect(put.status).toBe(200);
    expect(put.body.quiz.version).toBe(2);
    expect((await prisma.quizRevision.findFirstOrThrow()).source).toBe("editor");
  });

  it("version'siz (eski klient) saqlash ham ishlaydi", async () => {
    const { quiz, t } = await setup();
    const put = await request(app).put(`/api/quizzes/${quiz.id}`).set("Authorization", `Bearer ${t.jwt}`).send({ title: "X", slides: [] });
    expect(put.status).toBe(200);
  });
});

describe("Versiyalar tarixi", () => {
  it("egasi oldingi versiyaga qaytaradi; tiklash ham yangi versiya", async () => {
    const { quiz, t, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    await m.call("confirm_action", { actionId: p.data.actionId });
    const list = await request(app).get(`/api/quizzes/${quiz.id}/revisions`).set("Authorization", `Bearer ${t.jwt}`);
    expect(list.body.revisions).toHaveLength(1);
    expect(list.body.revisions[0]).toMatchObject({ version: 1, source: "mcp", slideCount: 3 });
    const rs = await request(app).post(`/api/quizzes/${quiz.id}/revisions/${list.body.revisions[0].id}/restore`).set("Authorization", `Bearer ${t.jwt}`);
    expect(rs.status).toBe(200);
    expect(rs.body.version).toBe(3);
    const s = await state(quiz.id);
    expect(s.ids).toHaveLength(3);
    expect(s.slides.map((x) => x.data.text)).toEqual(["Python 2-dars savol 1", "Python 2-dars savol 2", "Python 2-dars savol 3"]);
    const again = await request(app).get(`/api/quizzes/${quiz.id}/revisions`).set("Authorization", `Bearer ${t.jwt}`);
    expect(again.body.revisions[0]).toMatchObject({ source: "restore", slideCount: 4 }); // tiklashni ham qaytarish mumkin
  });

  it("egasi bo'lmagan ustoz tarixni ko'ra va tiklay olmaydi; admin oladi", async () => {
    const { quiz, t } = await setup();
    await request(app).put(`/api/quizzes/${quiz.id}`).set("Authorization", `Bearer ${t.jwt}`).send({ title: "X", version: 1, slides: [] });
    const rev = await prisma.quizRevision.findFirstOrThrow();
    const other = await makeTeacher({ canCreate: true });
    await prisma.lessonPlan.create({ data: { subject: "DASTURLASH", ageGroup: "MIDDLE", year: 1, title: "D", quizId: quiz.id } });
    expect((await request(app).get(`/api/quizzes/${quiz.id}/revisions`).set("Authorization", `Bearer ${other.jwt}`)).status).toBe(404);
    expect((await request(app).post(`/api/quizzes/${quiz.id}/revisions/${rev.id}/restore`).set("Authorization", `Bearer ${other.jwt}`)).status).toBe(403);
    const admin = await makeTeacher({ isAdmin: true });
    expect((await request(app).post(`/api/quizzes/${quiz.id}/revisions/${rev.id}/restore`).set("Authorization", `Bearer ${admin.jwt}`)).status).toBe(200);
    expect((await state(quiz.id)).ids).toHaveLength(3);
  });

  it("har quizda ko'pi bilan 20 ta versiya saqlanadi", async () => {
    const { quiz, t } = await setup();
    for (let v = 1; v <= 23; v++) {
      const r = await request(app).put(`/api/quizzes/${quiz.id}`).set("Authorization", `Bearer ${t.jwt}`).send({ title: `v${v}`, version: v, slides: [] });
      expect(r.status).toBe(200);
    }
    const revs = await prisma.quizRevision.findMany({ where: { quizId: quiz.id }, orderBy: { version: "asc" } });
    expect(revs).toHaveLength(20);
    expect(revs[0].version).toBe(4);
    expect(revs[19].version).toBe(23);
  });
});

describe("update_slide — qisman tahrir", () => {
  it("faqat yuborilgan maydon o'zgaradi; preview eski → yangi", async () => {
    const { quiz, m } = await setup();
    const slideId = quiz.slides[0].id;
    const p = await m.call("update_slide", { quizId: quiz.id, quizVersion: 1, slideId, changes: { text: "Yangi savol matni" } });
    expect(p.error).toBeNull();
    expect(p.data.preview).toContain("Savol matni: Python 2-dars savol 1 → Yangi savol matni");
    expect(p.data.diff).toEqual([{ field: "text", label: "Savol matni", before: "Python 2-dars savol 1", after: "Yangi savol matni" }]);
    await m.call("confirm_action", { actionId: p.data.actionId });
    const s = await state(quiz.id);
    expect(s.slides[0].data.text).toBe("Yangi savol matni");
    expect(s.slides[0].data.options).toEqual([{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }]);
    expect(s.slides[0].timeLimit).toBe(20);
    expect(s.ids).toEqual(quiz.slides.map((x) => x.id)); // id'lar o'zgarmagan
  });

  it("to'g'ri javobni almashtirish (correct) va null bilan izohni tozalash", async () => {
    const { quiz, m } = await setup();
    await prisma.slide.update({ where: { id: quiz.slides[1].id }, data: { notes: "eski izoh" } });
    const p = await m.call("update_slide", { quizId: quiz.id, quizVersion: 1, slideId: quiz.slides[1].id, changes: { correct: [1], notes: null } });
    expect(p.error).toBeNull();
    await m.call("confirm_action", { actionId: p.data.actionId });
    const s = await state(quiz.id);
    expect(s.slides[1].data.options.map((o: any) => o.isCorrect)).toEqual([false, true]);
    expect(s.slides[1].notes).toBeNull();
  });

  it("turga tegishli bo'lmagan maydon va validatsiya buzilishi — xato, taklif yaratilmaydi", async () => {
    const { quiz, m } = await setup();
    const sid = quiz.slides[0].id;
    const wrong = await m.call("update_slide", { quizId: quiz.id, quizVersion: 1, slideId: sid, changes: { pairs: [{ left: "a", right: "b" }] } });
    expect(wrong.error).toContain("\"pairs\" maydonini o'zgartirib bo'lmaydi");
    const broken = await m.call("update_slide", { quizId: quiz.id, quizVersion: 1, slideId: sid, changes: { correct: [] } });
    expect(broken.error).toContain("aynan bitta to'g'ri javob");
    const tooBig = await m.call("update_slide", { quizId: quiz.id, quizVersion: 1, slideId: sid, changes: { correct: [5] } });
    expect(tooBig.error).toContain("variant yo'q");
    const same = await m.call("update_slide", { quizId: quiz.id, quizVersion: 1, slideId: sid, changes: { text: "Python 2-dars savol 1" } });
    expect(same.error).toContain("o'zgarish yo'q");
    const empty = await m.call("update_slide", { quizId: quiz.id, quizVersion: 1, slideId: sid, changes: {} });
    expect(empty.error).toContain("yuborilmadi");
    expect(await prisma.mcpPendingAction.count()).toBe(0);
  });

  it("kanvas kontent slaydda element matni id bo'yicha o'zgaradi", async () => {
    const { quiz, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: { kind: "CONTENT", title: "Mavzu", body: "Izoh" } });
    const d = await m.call("confirm_action", { actionId: p.data.actionId });
    const u = await m.call("update_slide", {
      quizId: quiz.id, quizVersion: 2, slideId: d.data.slideId, changes: { elements: [{ id: "mcp-body", text: "Yangi izoh" }] },
    });
    expect(u.error).toBeNull();
    await m.call("confirm_action", { actionId: u.data.actionId });
    const s = await state(quiz.id);
    const el = s.slides[3].data.elements.find((e: any) => e.id === "mcp-body");
    expect(el.text).toBe("Yangi izoh");
    const bad = await m.call("update_slide", { quizId: quiz.id, quizVersion: 3, slideId: d.data.slideId, changes: { elements: [{ id: "yoq", text: "x" }] } });
    expect(bad.error).toContain("topilmadi");
  });
});

describe("Savol turlari validatsiyasi (add_slide)", () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ["SINGLE ikki to'g'ri", { kind: "QUESTION", type: "SINGLE", text: "?", options: [{ text: "a", correct: true }, { text: "b", correct: true }] }, "aynan bitta to'g'ri"],
    ["MULTIPLE to'g'risiz", { kind: "QUESTION", type: "MULTIPLE", text: "?", options: [{ text: "a" }, { text: "b" }] }, "kamida bitta to'g'ri"],
    ["bitta variant", { kind: "QUESTION", type: "DROPDOWN", text: "?", options: [{ text: "a", correct: true }] }, "Variantlar soni"],
    ["takror variant", { kind: "QUESTION", type: "SINGLE", text: "?", options: [{ text: "a", correct: true }, { text: "A" }] }, "takrorlanmasligi"],
    ["TRUE_FALSE javobsiz", { kind: "QUESTION", type: "TRUE_FALSE", text: "Yer yumaloq" }, "statementIsTrue"],
    ["FILL_BLANK soni mos emas", { kind: "QUESTION", type: "FILL_BLANK", text: "Yer ___ atrofida ___", blanks: [["Quyosh"]] }, "teng bo'lishi kerak"],
    ["MATCH bitta juft", { kind: "QUESTION", type: "MATCH", text: "?", pairs: [{ left: "a", right: "b" }] }, "Juftliklar soni"],
    ["REORDER bitta element", { kind: "QUESTION", type: "REORDER", text: "?", items: ["a"] }, "Elementlar soni"],
    ["savol matnsiz", { kind: "QUESTION", type: "OPEN", answers: ["x"] }, "Savol matni"],
    ["turga begona maydon", { kind: "QUESTION", type: "OPEN", text: "?", options: [{ text: "a" }] }, "\"options\" maydoni bo'lmaydi"],
    ["bo'sh kontent", { kind: "CONTENT" }, "kamida sarlavha"],
    ["http rasm", { kind: "CONTENT", title: "x", imageUrl: "http://example.com/a.png" }, "https://"],
  ];
  for (const [name, slide, msg] of cases) {
    it(name, async () => {
      const { quiz, m } = await setup();
      const r = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide });
      expect(r.error).toContain(msg);
      expect(await prisma.mcpPendingAction.count()).toBe(0);
    });
  }

  it("to'g'ri turlar qabul qilinadi; HTML teglari tozalanadi; POLL'da to'g'ri javob bo'lmaydi", async () => {
    const { quiz, m } = await setup();
    const ok = [
      { kind: "QUESTION", type: "TRUE_FALSE", text: "Yer <b>yumaloq</b>", statementIsTrue: true },
      { kind: "QUESTION", type: "POLL", text: "Qaysi?", options: [{ text: "a", correct: true }, { text: "b" }] },
      { kind: "QUESTION", type: "FILL_BLANK", text: "Yer ___ atrofida", blanks: [["Quyosh", "quyosh"]] },
      { kind: "QUESTION", type: "MATCH", text: "Jufting", pairs: [{ left: "1", right: "bir" }, { left: "2", right: "ikki" }] },
      { kind: "QUESTION", type: "REORDER", text: "Tartiblang", items: ["a", "b", "c"] },
      { kind: "QUESTION", type: "OPEN", text: "Fikringiz?" },
      { kind: "QUESTION", type: "MULTIPLE", text: "Juft sonlar", options: [{ text: "2", correct: true }, { text: "3" }, { text: "4", correct: true }] },
    ];
    let v = 1;
    for (const slide of ok) {
      const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: v, slide });
      expect(p.error, JSON.stringify(slide)).toBeNull();
      const d = await m.call("confirm_action", { actionId: p.data.actionId });
      expect(d.error).toBeNull();
      v = d.data.quizVersion;
    }
    const s = await state(quiz.id);
    expect(s.slides[3].data.text).toBe("Yer yumaloq");
    expect(s.slides[3].data.options).toEqual([{ text: "To'g'ri", isCorrect: true }, { text: "Noto'g'ri", isCorrect: false }]);
    expect(s.slides[4].data.options.every((o: any) => o.isCorrect === false)).toBe(true);
    expect(s.slides[8].data.answers).toEqual([]);
  });
});

describe("create_quiz", () => {
  it("taklif → quiz yo'q; tasdiq → slaydlari bilan papkada yaratiladi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const folder = await prisma.folder.create({ data: { name: "Python", teacherId: t.id } });
    const c = await connect(app, t.jwt);
    const m = await mcp(c.tokens!.access_token);
    const p = await m.call("create_quiz", { title: "Yangi dars", folderId: folder.id, slides: [single(), { kind: "CONTENT", title: "Kirish" }] });
    expect(p.error).toBeNull();
    expect(p.data.preview).toContain("Papka: Python");
    expect(await prisma.quiz.count()).toBe(0);
    const d = await m.call("confirm_action", { actionId: p.data.actionId });
    const q = await prisma.quiz.findUniqueOrThrow({ where: { id: d.data.quizId }, include: { slides: true } });
    expect(q).toMatchObject({ title: "Yangi dars", folderId: folder.id, teacherId: t.id, version: 1 });
    expect(q.slides).toHaveLength(2);
  });

  it("birovning papkasiga yaratib bo'lmaydi; slayd xatosi raqami bilan ko'rsatiladi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const other = await makeTeacher({ canCreate: true });
    const folder = await prisma.folder.create({ data: { name: "Begona", teacherId: other.id } });
    const c = await connect(app, t.jwt);
    const m = await mcp(c.tokens!.access_token);
    expect((await m.call("create_quiz", { title: "X", folderId: folder.id })).error).toContain("Papka topilmadi");
    const bad = await m.call("create_quiz", { title: "X", slides: [single(), { kind: "QUESTION", type: "SINGLE", text: "?", options: [] }] });
    expect(bad.error).toContain("2-slayd:");
  });
});

describe("Huquq va blok tasdiq paytida qayta tekshiriladi", () => {
  it("canCreate olinsa tasdiqlab bo'lmaydi", async () => {
    const { quiz, t, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    await prisma.teacher.update({ where: { id: t.id }, data: { canCreate: false } });
    const r = await m.call("confirm_action", { actionId: p.data.actionId });
    expect(r.error).toContain("slayd yaratish huquqi yo'q");
    expect((await state(quiz.id)).ids).toHaveLength(3);
  });

  it("uy vazifa bloki tasdiqni ham to'xtatadi", async () => {
    const { quiz, t, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    await prisma.teacher.update({ where: { id: t.id }, data: { hwStrikes: 3 } });
    expect((await m.call("confirm_action", { actionId: p.data.actionId })).error).toBe(HW_BLOCKED_MESSAGE);
  });

  it("birovning quizini tahrirlab bo'lmaydi; o'quv dasturdagisini slaydchi tahrirlay oladi", async () => {
    const owner = await makeTeacher({ canCreate: true });
    const foreign = await makeQuiz(owner.id, "Begona");
    const { m } = await setup();
    expect((await m.call("add_slide", { quizId: foreign.id, quizVersion: 1, slide: single() })).error).toContain("topilmadi");
    await prisma.lessonPlan.create({ data: { subject: "DASTURLASH", ageGroup: "MIDDLE", year: 1, title: "D", quizId: foreign.id } });
    expect((await m.call("add_slide", { quizId: foreign.id, quizVersion: 1, slide: single() })).error).toBeNull();
  });
});

describe("Platformadagi kutilayotgan tasdiqlar va audit", () => {
  it("ro'yxatda ko'rinadi va platformadan bekor qilinadi", async () => {
    const { quiz, t, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    const list = await request(app).get("/api/oauth/pending").set("Authorization", `Bearer ${t.jwt}`);
    expect(list.body.pending).toHaveLength(1);
    expect(list.body.pending[0].preview).toContain("2 + 2");
    const other = await makeTeacher();
    expect((await request(app).delete(`/api/oauth/pending/${list.body.pending[0].id}`).set("Authorization", `Bearer ${other.jwt}`)).status).toBe(404);
    expect((await request(app).delete(`/api/oauth/pending/${list.body.pending[0].id}`).set("Authorization", `Bearer ${t.jwt}`)).status).toBe(200);
    expect((await m.call("confirm_action", { actionId: p.data.actionId })).error).toContain("bekor qilingan");
  });

  it("taklif, tasdiq va bajarilish audit'ga source=mcp bilan yoziladi (to'liq actionId'siz)", async () => {
    const { quiz, m } = await setup();
    const p = await m.call("add_slide", { quizId: quiz.id, quizVersion: 1, slide: single() });
    await m.call("confirm_action", { actionId: p.data.actionId });
    let rows: any[] = [];
    for (let i = 0; i < 40 && rows.length < 3; i++) {
      await new Promise((r) => setTimeout(r, 50));
      rows = await prisma.auditLog.findMany({ where: { action: { startsWith: "mcp.action." } } });
    }
    expect(rows.map((r) => r.action).sort()).toEqual(["mcp.action.confirm", "mcp.action.execute", "mcp.action.propose"]);
    for (const r of rows) {
      expect(r.details.source).toBe("mcp");
      expect(r.details.client).toBe("Test Claude");
      expect(r.entityId).toBe(quiz.id);
    }
    expect(JSON.stringify(rows)).not.toContain(p.data.actionId);
  });
});
