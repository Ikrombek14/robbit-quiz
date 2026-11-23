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
import { resetDb, makeTeacher } from "./helpers.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Jonli dars oxirida har o'quvchining savollar bo'yicha natijasi saqlanadi va
// hisobotda (umumiy natijalar jadvali) qaytadi; host'ga hisobot id'si keladi.

const app = express();
app.use(express.json());
app.use("/api/reports", reportRouter);
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

describe("Jonli dars — umumiy natijalar", () => {
  it("javoblar saqlanadi, host hisobot id'sini oladi, hisobotda matritsa ma'lumoti bor", async () => {
    const t = await makeTeacher({ canCreate: true });
    const quiz = await prisma.quiz.create({
      data: {
        title: "Python: for sikli",
        teacherId: t.id,
        slides: {
          create: [
            { order: 0, kind: "CONTENT", data: JSON.stringify({ title: "Kirish" }) },
            { order: 1, kind: "QUESTION", type: "SINGLE", data: JSON.stringify(single("1-savol")) },
            { order: 2, kind: "QUESTION", type: "POLL", data: JSON.stringify({ text: "Yoqdimi?", options: [{ text: "Ha", isCorrect: false }, { text: "Yo'q", isCorrect: false }] }) },
            { order: 3, kind: "QUESTION", type: "SINGLE", data: JSON.stringify(single("3-savol")) },
          ],
        },
      },
    });

    const host = await client();
    const created = await ask(host, "host:create", { token: t.jwt, quizId: quiz.id });
    const pin = created.pin;
    const ali = await client();
    const vali = await client();
    await ask(ali, "player:join", { pin, nickname: "Ali" });
    await ask(vali, "player:join", { pin, nickname: "Vali" });

    host.emit("host:start", { pin, mode: "LIVE" }); // 0: kontent
    await tick();
    host.emit("host:next", { pin }); // 1: SINGLE
    await tick();
    ali.emit("player:answer", { pin, answer: 0 }); // to'g'ri
    vali.emit("player:answer", { pin, answer: 1 }); // xato
    await tick();
    host.emit("host:next", { pin }); // 2: POLL
    await tick();
    ali.emit("player:answer", { pin, answer: 0 });
    await tick();
    host.emit("host:next", { pin }); // 3: SINGLE — Vali javob bermaydi
    await tick();
    ali.emit("player:answer", { pin, answer: 0 });
    await tick();

    const report = once<{ recordId: string }>(host, "game:report");
    const ended = once(ali, "game:ended");
    host.emit("host:next", { pin }); // oxirgi slayddan keyin — yakun
    const { recordId } = await report;
    await ended;
    expect(recordId).toBeTruthy();

    const r = await request(app).get(`/api/reports/${recordId}`).set("Authorization", `Bearer ${t.jwt}`);
    expect(r.status).toBe(200);
    const stats = r.body.report.questionStats;
    expect(stats.map((q: any) => [q.index, q.type])).toEqual([[1, "SINGLE"], [2, "POLL"], [3, "SINGLE"]]);
    const byName = Object.fromEntries(r.body.report.players.map((p: any) => [p.nickname, p.answers]));
    expect(byName.Ali.answered.sort()).toEqual([1, 2, 3]);
    expect(byName.Ali.correct).toContain(1);
    expect(byName.Ali.correct).toContain(3);
    expect(byName.Vali).toEqual({ answered: [1], correct: [] });

    // Faqat o'z hisobotini ko'radi
    const other = await makeTeacher();
    expect((await request(app).get(`/api/reports/${recordId}`).set("Authorization", `Bearer ${other.jwt}`)).status).toBe(404);
  });

  it("eski hisobot (answers yo'q) — answers: null", async () => {
    const t = await makeTeacher();
    const g = await prisma.gameRecord.create({
      data: { teacherId: t.id, quizId: "q", title: "Eski", pin: "1", players: { create: [{ nickname: "A", score: 10, correctCount: 1, totalAnswered: 1 }] } },
    });
    const r = await request(app).get(`/api/reports/${g.id}`).set("Authorization", `Bearer ${t.jwt}`);
    expect(r.body.report.players[0].answers).toBeNull();
  });
});
