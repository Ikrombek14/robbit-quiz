import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { Server } from "socket.io";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { prisma } from "../src/prisma.js";
import { registerGameHandlers } from "../src/socket/game.js";
import { reportRouter } from "../src/routes/reports.js";
import { gradesRouter, parentRouter } from "../src/routes/grades.js";
import { computeScores, emptyGrades } from "../src/services/grades.js";
import { resetDb, makeTeacher } from "./helpers.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Dars baholari: ustoz jonli darsda davomat/uy vazifasi/amaliyot/odob belgilaydi,
// quiz bali avtomatik (har savolga max 100), hisobotda va oylik reytingda chiqadi.

const app = express();
app.use(express.json());
app.use("/api/reports", reportRouter);
app.use("/api/grades", gradesRouter);
app.use("/api/public/parent", parentRouter);
const httpServer = http.createServer(app);
const io = new Server(httpServer);
io.on("connection", (s) => registerGameHandlers(io, s));
let url = "";
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});
beforeEach(resetDb);
afterAll(async () => {
  for (const s of sockets) s.disconnect();
  io.close();
  await prisma.$disconnect();
});

function client(): Promise<ClientSocket> {
  const s = ioc(url, { transports: ["websocket"], forceNew: true });
  sockets.push(s);
  return new Promise((r) => s.on("connect", () => r(s)));
}
const ask = <T = any>(s: ClientSocket, ev: string, data: unknown) => new Promise<T>((r) => s.emit(ev, data, r));
const once = <T = any>(s: ClientSocket, ev: string) => new Promise<T>((r) => s.once(ev, r));
const tick = () => new Promise((r) => setTimeout(r, 80));
const single = (text: string) => ({ text, options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }] });

describe("computeScores", () => {
  it("standart: davomat va odob 100, baholanmaganlar jamiga kirmaydi", () => {
    const s = computeScores(emptyGrades());
    expect(s).toMatchObject({ attendance: 100, behavior: 100, homework: null, quiz: null, total: 200, max: 200, pct: 100 });
  });
  it("kechikish va odobsizlik −10 dan, 0 dan pastga tushmaydi", () => {
    const g = { ...emptyGrades(), late: 2, behavior: Array.from({ length: 12 }, () => ({ reason: "", at: 0 })), homework: false, quizSum: 150, quizMax: 200 };
    const s = computeScores(g);
    expect(s).toMatchObject({ attendance: 80, behavior: 0, homework: 0, quiz: 75, total: 155, max: 400, pct: 39 });
  });
});

describe("Jonli dars — baholash", () => {
  it("host baholaydi, bekor qiladi, hisobot va oylik reytingda chiqadi", async () => {
    const t = await makeTeacher({ canCreate: true });
    const quiz = await prisma.quiz.create({
      data: {
        title: "Python",
        teacherId: t.id,
        slides: {
          create: [
            { order: 0, kind: "QUESTION", type: "SINGLE", data: JSON.stringify(single("1-savol")) },
            { order: 1, kind: "QUESTION", type: "SINGLE", data: JSON.stringify(single("2-savol")) },
          ],
        },
      },
    });
    const host = await client();
    const { pin } = await ask(host, "host:create", { token: t.jwt, quizId: quiz.id });
    const ali = await client();
    const vali = await client();
    await ask(ali, "player:join", { pin, nickname: "Ali" });
    await ask(vali, "player:join", { pin, nickname: "Vali" });

    // Dars boshida: Vali kechikdi, Ali uy vazifasini qilgan, Vali qilmagan
    let r = await ask(host, "host:grades", { pin });
    const id = (n: string) => r.rows.find((x: any) => x.nickname === n).id;
    const aliId = id("Ali");
    const valiId = id("Vali");
    await ask(host, "host:grade", { pin, playerId: valiId, action: "late" });
    await ask(host, "host:grade", { pin, playerId: aliId, action: "homework", value: true });
    await ask(host, "host:grade", { pin, playerId: valiId, action: "homework", value: false });
    // Xato bosildi — bekor qilinadi
    await ask(host, "host:grade", { pin, playerId: aliId, action: "behavior", reason: "xato" });
    r = await ask(host, "host:gradeUndo", { pin });
    expect(r.rows.find((x: any) => x.id === aliId).scores.behavior).toBe(100);

    host.emit("host:start", { pin, mode: "LIVE" }); // 0: savol
    await tick();
    ali.emit("player:answer", { pin, answer: 0 });
    vali.emit("player:answer", { pin, answer: 1 });
    await tick();
    host.emit("host:next", { pin }); // 1: savol
    await tick();
    ali.emit("player:answer", { pin, answer: 0 });
    await tick();

    await ask(host, "host:grade", { pin, playerId: aliId, action: "practice1", value: 90 });
    await ask(host, "host:grade", { pin, playerId: valiId, action: "behavior", reason: "O'yin o'ynadi" });
    r = await ask(host, "host:grades", { pin });
    const ali1 = r.rows.find((x: any) => x.id === aliId).scores;
    expect(ali1.quiz).toBeGreaterThanOrEqual(50);
    expect(ali1.practice1).toBe(90);
    const vali1 = r.rows.find((x: any) => x.id === valiId).scores;
    expect(vali1).toMatchObject({ attendance: 90, homework: 0, quiz: 0, behavior: 90 });

    // Boshqa (host bo'lmagan) socket baholay olmaydi
    expect((await ask(ali, "host:grade", { pin, playerId: aliId, action: "practice2", value: 100 })).ok).toBe(false);

    const report = once<{ recordId: string }>(host, "game:report");
    host.emit("host:next", { pin }); // yakun
    const { recordId } = await report;

    const auth = { Authorization: `Bearer ${t.jwt}` };
    const rep = await request(app).get(`/api/reports/${recordId}`).set(auth);
    const p = Object.fromEntries(rep.body.report.players.map((x: any) => [x.nickname, x]));
    expect(p.Vali.grades.behavior[0].reason).toBe("O'yin o'ynadi");
    expect(p.Ali.scores.practice1).toBe(90);

    // Dars tugagach: guruh belgilanadi, Vali amaliyoti tuzatiladi
    expect((await request(app).patch(`/api/reports/${recordId}`).set(auth).send({ groupName: "Python-3" })).status).toBe(200);
    const upd = await request(app).put(`/api/reports/${recordId}/players/${p.Vali.id}/grades`).set(auth).send({ practice1: 40, quizSum: 999 });
    expect(upd.body.scores.practice1).toBe(40);
    expect(upd.body.grades.quizSum).toBe(0); // quiz qo'lda o'zgarmaydi

    const month = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
    const m = await request(app).get(`/api/grades/monthly?month=${month}&group=Python-3`).set(auth);
    expect(m.status).toBe(200);
    expect(m.body.students.map((s: any) => s.nickname)).toEqual(["Ali", "Vali"]);
    expect(m.body.students[1].place).toBe(2);
    expect((await request(app).get("/api/grades/groups").set(auth)).body.groups).toEqual(["Python-3"]);

    // Ota-ona: faqat o'z farzandi
    const link = await request(app).post("/api/grades/parent-link").set(auth).send({ group: "Python-3", nickname: "vali" });
    const pr = await request(app).get(`/api/public/parent/${link.body.token}?month=${month}`);
    expect(pr.status).toBe(200);
    expect(pr.body.student.nickname).toBe("Vali");
    expect(pr.body.student.place).toBe(2);
    expect(pr.body.groupSize).toBe(2);
    expect(JSON.stringify(pr.body)).not.toContain("Ali");
    expect((await request(app).get(`/api/public/parent/notatoken`)).status).toBe(404);
  });

  it("baholashdan oldingi darslar (grades = {}) reytingga kirmaydi", async () => {
    const t = await makeTeacher();
    const g = await prisma.gameRecord.create({
      data: { teacherId: t.id, quizId: "q", title: "Eski", pin: "1", players: { create: [{ nickname: "A", score: 10 }] } },
    });
    const auth = { Authorization: `Bearer ${t.jwt}` };
    expect((await request(app).get(`/api/reports/${g.id}`).set(auth)).body.report.hasGrades).toBe(false);
    const month = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
    const m = await request(app).get(`/api/grades/monthly?month=${month}`).set(auth);
    expect(m.body.students).toEqual([]);
    expect(m.body.lessons).toEqual([]);
  });
});
