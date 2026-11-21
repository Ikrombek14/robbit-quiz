import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { prisma } from "../src/prisma.js";
import { buildApp, listen, resetDb, makeTeacher, connect } from "./helpers.js";

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
  const call = async (name: string, args: Record<string, unknown>) => {
    const r: any = await client.callTool({ name, arguments: args });
    return { error: r.isError ? (r.content[0].text as string) : null, data: r.isError ? null : JSON.parse(r.content[0].text) };
  };
  // Taklif + tasdiq (xato bo'lsa — taklif xatosi)
  const apply = async (name: string, args: Record<string, unknown>) => {
    const p = await call(name, args);
    if (p.error) return p;
    return call("confirm_action", { actionId: p.data.actionId });
  };
  return { call, apply };
}

const SLIDES: Record<string, any> = {
  SINGLE: { text: "Poytaxt?", options: [{ text: "Toshkent", isCorrect: true }, { text: "Samarqand", isCorrect: false }, { text: "Buxoro", isCorrect: false }] },
  MULTIPLE: { text: "Juft sonlar", options: [{ text: "2", isCorrect: true }, { text: "3", isCorrect: false }, { text: "4", isCorrect: true }] },
  POLL: { text: "Qaysi rang?", options: [{ text: "Qizil", isCorrect: false }, { text: "Ko'k", isCorrect: false }] },
  TRUE_FALSE: { text: "Yer yumaloq", options: [{ text: "To'g'ri", isCorrect: true }, { text: "Noto'g'ri", isCorrect: false }] },
  MATCH: { text: "Jufting", pairs: [{ left: "1", right: "bir" }, { left: "2", right: "ikki" }] },
  REORDER: { text: "Tartiblang", items: ["birinchi", "ikkinchi", "uchinchi"] },
  FILL_BLANK: { text: "Yer ___ atrofida aylanadi", blanks: [["Quyosh"]] },
  OPEN: { text: "Fikringiz?", answers: ["ha"] },
};

async function setup(type: keyof typeof SLIDES) {
  const t = await makeTeacher({ canCreate: true });
  const quiz = await prisma.quiz.create({
    data: {
      title: "Sinov",
      teacherId: t.id,
      slides: {
        create: [
          { order: 0, kind: "QUESTION", type, data: JSON.stringify(SLIDES[type]), notes: "izoh", timeLimit: 30, points: 500 },
          { order: 1, kind: "CONTENT", data: JSON.stringify({ title: "Ikkinchi" }) },
          { order: 2, kind: "CONTENT", data: JSON.stringify({ title: "Uchinchi" }) },
        ],
      },
    },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  const c = await connect(app, t.jwt);
  return { t, quiz, sid: quiz.slides[0].id, m: await mcp(c.tokens!.access_token) };
}

const dataOf = async (slideId: string) => {
  const s = await prisma.slide.findUniqueOrThrow({ where: { id: slideId } });
  return { ...s, data: JSON.parse(s.data) };
};

describe("get_slide items (itemId)", () => {
  it("variantlar, juftliklar, tartib va bo'sh joylar itemId bilan; quizVersion ko'rsatiladi", async () => {
    const { quiz, sid, m } = await setup("SINGLE");
    const s = await m.call("get_slide", { quizId: quiz.id, slideId: sid });
    expect(s.data.items).toEqual([
      { itemId: "opt-0", text: "Toshkent", correct: true },
      { itemId: "opt-1", text: "Samarqand", correct: false },
      { itemId: "opt-2", text: "Buxoro", correct: false },
    ]);
    expect(s.data.itemsNote).toContain("quizVersion=1");
    for (const [type, prefix] of [["MATCH", "pair-0"], ["REORDER", "item-0"], ["FILL_BLANK", "blank-0"]] as const) {
      const x = await setup(type);
      const r = await x.m.call("get_slide", { quizId: x.quiz.id, slideId: x.sid });
      expect(r.data.items[0].itemId).toBe(prefix);
    }
  });
});

describe("edit_slide_items", () => {
  it("update: bitta variant matnini o'zgartirib to'g'ri qilish — qolganlari avtomatik noto'g'ri (SINGLE)", async () => {
    const { quiz, sid, m } = await setup("SINGLE");
    const p = await m.call("edit_slide_items", { quizId: quiz.id, quizVersion: 1, slideId: sid, operations: [{ op: "update", itemId: "opt-1", text: "print()", correct: true }] });
    expect(p.error).toBeNull();
    expect(p.data.preview).toContain("Oldin:");
    expect(p.data.preview).toContain("B) print() ✓");
    expect((await dataOf(sid)).data).toEqual(SLIDES.SINGLE); // taklif hech narsani o'zgartirmagan
    await m.call("confirm_action", { actionId: p.data.actionId });
    const d = (await dataOf(sid)).data;
    expect(d.options).toEqual([
      { text: "Toshkent", isCorrect: false },
      { text: "print()", isCorrect: true },
      { text: "Buxoro", isCorrect: false },
    ]);
  });

  it("add, remove, move bitta chaqiruvda — barcha itemId'lar ASL ro'yxat bo'yicha", async () => {
    const { quiz, sid, m } = await setup("MULTIPLE");
    const r = await m.apply("edit_slide_items", {
      quizId: quiz.id, quizVersion: 1, slideId: sid,
      operations: [
        { op: "move", itemId: "opt-2", position: 1 }, // "4" boshiga
        { op: "remove", itemId: "opt-1" }, // "3" (asl id bo'yicha — move'dan keyin ham to'g'ri topiladi)
        { op: "add", text: "6", correct: true },
      ],
    });
    expect(r.error).toBeNull();
    expect((await dataOf(sid)).data.options).toEqual([
      { text: "4", isCorrect: true },
      { text: "2", isCorrect: true },
      { text: "6", isCorrect: true },
    ]);
  });

  it("atomar: bitta amal xato bo'lsa hech narsa saqlanmaydi va taklif yaratilmaydi", async () => {
    const { quiz, sid, m } = await setup("SINGLE");
    const r = await m.call("edit_slide_items", {
      quizId: quiz.id, quizVersion: 1, slideId: sid,
      operations: [{ op: "update", itemId: "opt-0", text: "Toshkent shahri" }, { op: "remove", itemId: "opt-9" }],
    });
    expect(r.error).toContain("2-amal");
    expect(r.error).toContain("topilmadi");
    expect(await prisma.mcpPendingAction.count()).toBe(0);
    expect((await dataOf(sid)).data).toEqual(SLIDES.SINGLE);
  });

  it("bir itemId'ni ikki marta olib tashlash, noto'g'ri prefiks, ruxsat etilmagan maydon — xato", async () => {
    const { quiz, sid, m } = await setup("SINGLE");
    const base = { quizId: quiz.id, quizVersion: 1, slideId: sid };
    expect((await m.call("edit_slide_items", { ...base, operations: [{ op: "remove", itemId: "opt-0" }, { op: "remove", itemId: "opt-0" }] })).error).toContain("allaqachon olib tashlangan");
    expect((await m.call("edit_slide_items", { ...base, operations: [{ op: "remove", itemId: "pair-0" }] })).error).toContain("noto'g'ri itemId");
    expect((await m.call("edit_slide_items", { ...base, operations: [{ op: "update", itemId: "opt-0", left: "x" }] })).error).toContain("\"left\" maydoni bo'lmaydi");
    expect((await m.call("edit_slide_items", { ...base, operations: [{ op: "move", itemId: "opt-0" }] })).error).toContain("position kerak");
  });

  it("chegaralar: variantlar 2 tadan kam yoki 8 tadan ko'p bo'lmaydi; to'g'ri javobsiz qolmaydi", async () => {
    const { quiz, sid, m } = await setup("SINGLE");
    const base = { quizId: quiz.id, quizVersion: 1, slideId: sid };
    expect((await m.call("edit_slide_items", { ...base, operations: [{ op: "remove", itemId: "opt-1" }, { op: "remove", itemId: "opt-2" }] })).error).toContain("Variantlar soni");
    const many = Array.from({ length: 6 }, (_, i) => ({ op: "add", text: `x${i}` }));
    expect((await m.call("edit_slide_items", { ...base, operations: many })).error).toContain("Variantlar soni");
    expect((await m.call("edit_slide_items", { ...base, operations: [{ op: "update", itemId: "opt-0", correct: false }] })).error).toContain("aynan bitta to'g'ri");
  });

  it("MATCH: juftlikning chap va o'ng tomoni alohida o'zgaradi", async () => {
    const { quiz, sid, m } = await setup("MATCH");
    const r = await m.apply("edit_slide_items", {
      quizId: quiz.id, quizVersion: 1, slideId: sid,
      operations: [{ op: "update", itemId: "pair-1", right: "IKKI" }, { op: "add", left: "3", right: "uch" }],
    });
    expect(r.error).toBeNull();
    expect((await dataOf(sid)).data.pairs).toEqual([{ left: "1", right: "bir" }, { left: "2", right: "IKKI" }, { left: "3", right: "uch" }]);
  });

  it("REORDER: move to'g'ri tartibni ham o'zgartiradi", async () => {
    const { quiz, sid, m } = await setup("REORDER");
    const r = await m.apply("edit_slide_items", { quizId: quiz.id, quizVersion: 1, slideId: sid, operations: [{ op: "move", itemId: "item-2", position: 1 }] });
    expect(r.error).toBeNull();
    expect((await dataOf(sid)).data.items).toEqual(["uchinchi", "birinchi", "ikkinchi"]);
  });

  it("FILL_BLANK: bo'sh joy qo'shish matndagi ___ bilan birga; mos kelmasa xato", async () => {
    const { quiz, sid, m } = await setup("FILL_BLANK");
    const base = { quizId: quiz.id, quizVersion: 1, slideId: sid };
    expect((await m.call("edit_slide_items", { ...base, operations: [{ op: "add", answers: ["365"] }] })).error).toContain("teng bo'lishi kerak");
    const r = await m.apply("edit_slide_items", { ...base, text: "Yer ___ atrofida ___ kunda aylanadi", operations: [{ op: "add", answers: ["365", "366"] }, { op: "update", itemId: "blank-0", answers: ["Quyosh", "quyosh"] }] });
    expect(r.error).toBeNull();
    const d = (await dataOf(sid)).data;
    expect(d.text).toBe("Yer ___ atrofida ___ kunda aylanadi");
    expect(d.blanks).toEqual([["Quyosh", "quyosh"], ["365", "366"]]);
  });

  it("POLL'da correct berilmaydi; TRUE_FALSE va OPEN'da elementlar yo'q", async () => {
    const poll = await setup("POLL");
    expect((await poll.m.call("edit_slide_items", { quizId: poll.quiz.id, quizVersion: 1, slideId: poll.sid, operations: [{ op: "add", text: "Yashil", correct: true }] })).error).toContain("\"correct\" maydoni bo'lmaydi");
    const tf = await setup("TRUE_FALSE");
    expect((await tf.m.call("edit_slide_items", { quizId: tf.quiz.id, quizVersion: 1, slideId: tf.sid, operations: [{ op: "add", text: "x" }] })).error).toContain("statementIsTrue");
    const open = await setup("OPEN");
    expect((await open.m.call("edit_slide_items", { quizId: open.quiz.id, quizVersion: 1, slideId: open.sid, operations: [{ op: "add", text: "x" }] })).error).toContain("update_slide");
  });

  it("eski quizVersion bilan — rad (itemId'lar eskirgan bo'lishi mumkin)", async () => {
    const { quiz, sid, t, m } = await setup("SINGLE");
    const g = await request(app).get(`/api/quizzes/${quiz.id}`).set("Authorization", `Bearer ${t.jwt}`);
    await request(app).put(`/api/quizzes/${quiz.id}`).set("Authorization", `Bearer ${t.jwt}`).send({ title: "X", version: 1, slides: g.body.quiz.slides });
    const r = await m.call("edit_slide_items", { quizId: quiz.id, quizVersion: 1, slideId: sid, operations: [{ op: "remove", itemId: "opt-0" }] });
    expect(r.error).toContain("versiyasi o'zgargan");
  });
});

describe("change_slide_type", () => {
  it("SINGLE → MULTIPLE: variantlar va to'g'ri javob saqlanadi, yo'qoladigan narsa yo'q", async () => {
    const { quiz, sid, m } = await setup("SINGLE");
    const p = await m.call("change_slide_type", { quizId: quiz.id, quizVersion: 1, slideId: sid, newType: "MULTIPLE" });
    expect(p.error).toBeNull();
    expect(p.data.preview).toContain("Yo'qoladigan ma'lumot yo'q");
    expect(p.data.diff.kept).toContain("Variant matnlari");
    await m.call("confirm_action", { actionId: p.data.actionId });
    const s = await dataOf(sid);
    expect(s.type).toBe("MULTIPLE");
    expect(s.data.options).toEqual(SLIDES.SINGLE.options);
    expect(s).toMatchObject({ notes: "izoh", timeLimit: 30, points: 500 });
  });

  it("MULTIPLE → SINGLE: ortiqcha to'g'ri belgi yo'qoladi deb ko'rsatiladi", async () => {
    const { quiz, sid, m } = await setup("MULTIPLE");
    const p = await m.call("change_slide_type", { quizId: quiz.id, quizVersion: 1, slideId: sid, newType: "SINGLE" });
    expect(p.data.preview).toContain("YO'QOLADI");
    expect(p.data.diff.lost[0]).toContain("faqat birinchisi qoladi: 2");
    await m.call("confirm_action", { actionId: p.data.actionId });
    expect((await dataOf(sid)).data.options.map((o: any) => o.isCorrect)).toEqual([true, false, false]);
  });

  it("variantlar → POLL / OPEN / REORDER", async () => {
    let x = await setup("SINGLE");
    expect((await x.m.apply("change_slide_type", { quizId: x.quiz.id, quizVersion: 1, slideId: x.sid, newType: "POLL" })).error).toBeNull();
    expect((await dataOf(x.sid)).data.options.every((o: any) => !o.isCorrect)).toBe(true);
    x = await setup("MULTIPLE");
    expect((await x.m.apply("change_slide_type", { quizId: x.quiz.id, quizVersion: 1, slideId: x.sid, newType: "OPEN" })).error).toBeNull();
    expect((await dataOf(x.sid)).data.answers).toEqual(["2", "4"]);
    x = await setup("SINGLE");
    expect((await x.m.apply("change_slide_type", { quizId: x.quiz.id, quizVersion: 1, slideId: x.sid, newType: "REORDER" })).error).toBeNull();
    expect((await dataOf(x.sid)).data.items).toEqual(["Toshkent", "Samarqand", "Buxoro"]);
  });

  it("MATCH → SINGLE: juftliklar YO'QOLADI, yangi variantlar extra bilan beriladi", async () => {
    const { quiz, sid, m } = await setup("MATCH");
    const base = { quizId: quiz.id, quizVersion: 1, slideId: sid, newType: "SINGLE" };
    expect((await m.call("change_slide_type", base)).error).toContain("Variantlar soni");
    const p = await m.call("change_slide_type", { ...base, extra: { options: [{ text: "a", correct: true }, { text: "b" }] } });
    expect(p.error).toBeNull();
    expect(p.data.diff.lost).toContain("Juftliklar (2 ta)");
    await m.call("confirm_action", { actionId: p.data.actionId });
    const s = await dataOf(sid);
    expect(s.type).toBe("SINGLE");
    expect(s.data.pairs).toBeUndefined();
  });

  it("TRUE_FALSE / MATCH / FILL_BLANK ga o'tish uchun kerakli maydonlar talab qilinadi", async () => {
    const { quiz, sid, m } = await setup("SINGLE");
    const base = { quizId: quiz.id, quizVersion: 1, slideId: sid };
    expect((await m.call("change_slide_type", { ...base, newType: "TRUE_FALSE" })).error).toContain("statementIsTrue");
    expect((await m.call("change_slide_type", { ...base, newType: "MATCH" })).error).toContain("pairs");
    expect((await m.call("change_slide_type", { ...base, newType: "FILL_BLANK" })).error).toContain("blanks");
    expect((await m.call("change_slide_type", { ...base, newType: "FILL_BLANK", extra: { text: "Poytaxt: ___", blanks: [["Toshkent"]] } })).error).toBeNull();
  });

  it("bir xil tur va kontent slayd — xato", async () => {
    const { quiz, sid, m } = await setup("SINGLE");
    expect((await m.call("change_slide_type", { quizId: quiz.id, quizVersion: 1, slideId: sid, newType: "SINGLE" })).error).toContain("allaqachon");
    expect((await m.call("change_slide_type", { quizId: quiz.id, quizVersion: 1, slideId: quiz.slides[1].id, newType: "SINGLE" })).error).toContain("Kontent slaydni");
  });

  it("destructiveHint annotatsiyasi qo'yilgan", async () => {
    const t = await makeTeacher({ canCreate: true });
    const c = await connect(app, t.jwt);
    const client = new Client({ name: "t", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${srv.url}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${c.tokens!.access_token}` } } }));
    clients.push(client);
    const { tools } = await client.listTools();
    expect(tools.find((x) => x.name === "change_slide_type")?.annotations?.destructiveHint).toBe(true);
  });
});

describe("reorder_slides", () => {
  it("slideId + position: bitta slayd ko'chadi, id'lar o'zgarmaydi; preview eski → yangi", async () => {
    const { quiz, m } = await setup("SINGLE");
    const ids = quiz.slides.map((s) => s.id);
    const p = await m.call("reorder_slides", { quizId: quiz.id, quizVersion: 1, slideId: ids[2], position: 1 });
    expect(p.error).toBeNull();
    expect(p.data.preview).toContain("«Uchinchi»: 3 → 1");
    await m.call("confirm_action", { actionId: p.data.actionId });
    const rows = await prisma.slide.findMany({ where: { quizId: quiz.id }, orderBy: { order: "asc" } });
    expect(rows.map((r) => r.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect((await prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id } })).version).toBe(2);
  });

  it("to'liq order; noto'liq, takroriy yoki noma'lum id — xato", async () => {
    const { quiz, m } = await setup("SINGLE");
    const ids = quiz.slides.map((s) => s.id);
    const base = { quizId: quiz.id, quizVersion: 1 };
    expect((await m.call("reorder_slides", { ...base, order: [ids[0], ids[1]] })).error).toContain("BARCHA slaydlarni");
    expect((await m.call("reorder_slides", { ...base, order: [ids[0], ids[0], ids[1]] })).error).toContain("takrorlangan");
    expect((await m.call("reorder_slides", { ...base, order: [ids[0], ids[1], "yoq"] })).error).toContain("Noma'lum id");
    expect((await m.call("reorder_slides", { ...base, order: ids })).error).toContain("o'zgarmaydi");
    expect((await m.call("reorder_slides", base)).error).toContain("slideId + position");
    const r = await m.apply("reorder_slides", { ...base, order: [ids[1], ids[2], ids[0]] });
    expect(r.error).toBeNull();
    const rows = await prisma.slide.findMany({ where: { quizId: quiz.id }, orderBy: { order: "asc" } });
    expect(rows.map((x) => x.id)).toEqual([ids[1], ids[2], ids[0]]);
  });

  it("tartiblash ham versiyalar tarixiga yoziladi va tiklanadi", async () => {
    const { quiz, t, m } = await setup("SINGLE");
    const ids = quiz.slides.map((s) => s.id);
    await m.apply("reorder_slides", { quizId: quiz.id, quizVersion: 1, slideId: ids[0], position: 3 });
    const revs = await request(app).get(`/api/quizzes/${quiz.id}/revisions`).set("Authorization", `Bearer ${t.jwt}`);
    expect(revs.body.revisions[0].source).toBe("mcp");
    await request(app).post(`/api/quizzes/${quiz.id}/revisions/${revs.body.revisions[0].id}/restore`).set("Authorization", `Bearer ${t.jwt}`);
    const rows = await prisma.slide.findMany({ where: { quizId: quiz.id }, orderBy: { order: "asc" } });
    expect(rows[0].type).toBe("SINGLE");
  });
});
