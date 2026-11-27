import { describe, it, expect, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { prisma } from "../src/prisma.js";
import { buildApp, resetDb, makeTeacher, makeQuiz } from "./helpers.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const app = buildApp();
beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

const auth = (jwt: string) => ({ Authorization: `Bearer ${jwt}` });

async function linkedLesson() {
  const owner = await makeTeacher({ canCreate: true });
  const quiz = await makeQuiz(owner.id, "Python: for sikli", 1);
  await prisma.lessonPlan.create({ data: { subject: "DASTURLASH", ageGroup: "MIDDLE", year: 1, title: "7-dars", quizId: quiz.id } });
  return { owner, quiz };
}

describe("Dars matni", () => {
  it("bo'sh bo'lsa — bo'sh qaytadi; slaydchi yozadi, oddiy ustoz faqat o'qiydi", async () => {
    const { quiz } = await linkedLesson();
    const slaydchi = await makeTeacher({ canCreate: true });
    const ustoz = await makeTeacher({ canCreate: false });

    const empty = await request(app).get(`/api/quizzes/${quiz.id}/notes`).set(auth(ustoz.jwt));
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ lessonText: "", canEditText: false, comments: [] });

    const denied = await request(app).put(`/api/quizzes/${quiz.id}/lesson-text`).set(auth(ustoz.jwt)).send({ text: "Men yozdim" });
    expect(denied.status).toBe(403);

    const ok = await request(app).put(`/api/quizzes/${quiz.id}/lesson-text`).set(auth(slaydchi.jwt)).send({ text: "  1. Kirish\n2. Misol  " });
    expect(ok.status).toBe(200);
    expect(ok.body.lessonText).toBe("1. Kirish\n2. Misol");
    expect(ok.body.lessonTextUpdatedBy).toBe(slaydchi.name);

    const seen = await request(app).get(`/api/quizzes/${quiz.id}/notes`).set(auth(ustoz.jwt));
    expect(seen.body.lessonText).toBe("1. Kirish\n2. Misol");

    // Bo'sh matn — o'chiriladi, bo'lim yana yashirinadi
    await request(app).put(`/api/quizzes/${quiz.id}/lesson-text`).set(auth(slaydchi.jwt)).send({ text: "   " });
    expect(await prisma.lessonText.count()).toBe(0);
  });

  it("dars matnini yozish quiz versiyasini o'zgartirmaydi (muharrir bilan to'qnashmaydi)", async () => {
    const { owner, quiz } = await linkedLesson();
    await request(app).put(`/api/quizzes/${quiz.id}/lesson-text`).set(auth(owner.jwt)).send({ text: "Reja" });
    expect((await prisma.quiz.findUniqueOrThrow({ where: { id: quiz.id } })).version).toBe(1);
  });

  it("birovning shaxsiy (dasturga biriktirilmagan) quizi — ko'rinmaydi", async () => {
    const owner = await makeTeacher({ canCreate: true });
    const priv = await makeQuiz(owner.id, "Shaxsiy", 1);
    const other = await makeTeacher({ canCreate: true });
    expect((await request(app).get(`/api/quizzes/${priv.id}/notes`).set(auth(other.jwt))).status).toBe(404);
    expect((await request(app).put(`/api/quizzes/${priv.id}/lesson-text`).set(auth(other.jwt)).send({ text: "x" })).status).toBe(404);
  });
});

describe("Darsga izohlar", () => {
  it("har qanday ko'ruvchi izoh qoldiradi; faqat muallif yoki admin o'chiradi", async () => {
    const { quiz } = await linkedLesson();
    const a = await makeTeacher();
    const b = await makeTeacher();
    const admin = await makeTeacher({ isAdmin: true });

    const c = await request(app).post(`/api/quizzes/${quiz.id}/comments`).set(auth(a.jwt)).send({ text: "Misollar ko'proq bo'lsin" });
    expect(c.status).toBe(201);
    expect(c.body.comment).toMatchObject({ authorName: a.name, source: "VIEW" });

    const list = await request(app).get(`/api/quizzes/${quiz.id}/notes`).set(auth(b.jwt));
    expect(list.body.comments).toHaveLength(1);
    expect(list.body.comments[0].canDelete).toBe(false);

    expect((await request(app).delete(`/api/quizzes/${quiz.id}/comments/${c.body.comment.id}`).set(auth(b.jwt))).status).toBe(403);
    expect((await request(app).delete(`/api/quizzes/${quiz.id}/comments/${c.body.comment.id}`).set(auth(admin.jwt))).status).toBe(200);
    expect(await prisma.lessonComment.count()).toBe(0);
  });

  it("dars yakunidagi fikr — AFTER_LESSON, o'z sessiyasiga bog'lanadi", async () => {
    const { quiz } = await linkedLesson();
    const t = await makeTeacher();
    const game = await prisma.gameRecord.create({ data: { teacherId: t.id, quizId: quiz.id, title: quiz.title, pin: "1" } });
    const foreignGame = await prisma.gameRecord.create({ data: { teacherId: (await makeTeacher()).id, quizId: quiz.id, title: quiz.title, pin: "2" } });

    await request(app).post(`/api/quizzes/${quiz.id}/comments`).set(auth(t.jwt)).send({ text: "Vaqt yetmadi", source: "AFTER_LESSON", gameId: game.id });
    await request(app).post(`/api/quizzes/${quiz.id}/comments`).set(auth(t.jwt)).send({ text: "Boshqa", source: "AFTER_LESSON", gameId: foreignGame.id });
    const rows = await prisma.lessonComment.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.source, r.gameId])).toEqual([["AFTER_LESSON", game.id], ["AFTER_LESSON", null]]);
  });

  it("host havolasi orqali birovning shaxsiy darsini o'tkazgan ustoz ham fikr qoldiradi", async () => {
    const owner = await makeTeacher({ canCreate: true });
    const priv = await makeQuiz(owner.id, "Shaxsiy", 1);
    const guest = await makeTeacher();
    expect((await request(app).post(`/api/quizzes/${priv.id}/comments`).set(auth(guest.jwt)).send({ text: "x" })).status).toBe(404);
    await prisma.gameRecord.create({ data: { teacherId: guest.id, quizId: priv.id, title: "Shaxsiy", pin: "3" } });
    expect((await request(app).post(`/api/quizzes/${priv.id}/comments`).set(auth(guest.jwt)).send({ text: "Yaxshi dars" })).status).toBe(201);
  });

  it("bo'sh yoki juda uzun izoh rad etiladi", async () => {
    const { quiz } = await linkedLesson();
    const t = await makeTeacher();
    expect((await request(app).post(`/api/quizzes/${quiz.id}/comments`).set(auth(t.jwt)).send({ text: "   " })).status).toBe(400);
    expect((await request(app).post(`/api/quizzes/${quiz.id}/comments`).set(auth(t.jwt)).send({ text: "x".repeat(3000) })).status).toBe(400);
  });
});
