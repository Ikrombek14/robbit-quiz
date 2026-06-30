import type { Server, Socket } from "socket.io";
import { prisma } from "../prisma.js";
import { verifyToken } from "../auth.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface LoadedSlide {
  id: string;
  kind: string;
  type: string | null;
  data: any;
  timeLimit: number;
  points: number;
}
interface GamePlayer {
  playerId: string;
  socketId: string;
  nickname: string;
  score: number;
  lastGain: number;
  answeredCurrent: boolean;
  connected: boolean;
  correctCount: number;
  totalAnswered: number;
  answeredIndices: number[]; // ball ikki marta qo'shilmasligi uchun
  flags: number; // anti-cheat ogohlantirishlar soni
  testIndex: number; // TEST rejimi: o'quvchi turgan savol raqami
  finished: boolean; // TEST rejimi: testni tugatdimi
  finishedAt: number; // TEST rejimi: tugatgan vaqti (ms)
  qStartedAt: number; // TEST rejimi: joriy savol boshlangan vaqt (vaqt o'lchash uchun)
  testDetails: TestDetail[]; // TEST rejimi: har savol bo'yicha tafsilot (hisobot uchun)
}
interface TestDetail {
  index: number; // savol tartib raqami (test ichida)
  text: string; // savol matni
  answer: string; // o'quvchi javobi (o'qiladigan ko'rinishda)
  correct: boolean; // to'g'ri/xato
  timeMs: number; // shu savolga sarflangan vaqt (ms)
  correctAns: string; // to'g'ri javob (taqqoslash uchun)
}
interface GameSettings {
  questionTimer: boolean; // savol taymeri yoqilganmi
  anonymous: boolean; // ismlarni yashirish
  serious: boolean; // jiddiy rejim (gamifikatsiyasiz)
  antiCheat: boolean; // fullscreen/tab tark etishni kuzatish
  disableRightClick: boolean; // o'ng tugmani o'chirish
}
const defaultSettings = (): GameSettings => ({
  questionTimer: true,
  anonymous: false,
  serious: false,
  antiCheat: false,
  disableRightClick: false,
});
// O'quvchiga yuboriladigan sozlamalar (xulq-atvorga ta'sir qiluvchi)
function clientSettings(game: GameState) {
  return {
    antiCheat: game.settings.antiCheat,
    disableRightClick: game.settings.disableRightClick,
    serious: game.settings.serious,
  };
}
interface QStat {
  index: number;
  text: string;
  correct: number;
  total: number;
}
interface GameState {
  pin: string;
  hostSocketId: string;
  teacherId: string;
  quizId: string;
  title: string;
  slides: LoadedSlide[];
  mode: "LIVE" | "TEST";
  questionIndices: number[]; // TEST rejimi: faqat QUESTION slaydlar indekslari
  currentIndex: number;
  status: "lobby" | "active" | "reveal" | "ended";
  players: Map<string, GamePlayer>;
  questionStartedAt: number;
  timerEndsAt: number; // savol taymeri tugash vaqti (ms epoch); 0 = taymer yo'q
  timer: ReturnType<typeof setTimeout> | null;
  hostGraceTimer: ReturnType<typeof setTimeout> | null; // host uzilganda kutish (sahifa yangilash uchun)
  votes: Record<string, number>;
  stats: Map<number, QStat>;
  saved: boolean;
  settings: GameSettings;
}

const games = new Map<string, GameState>();

function genPin(): string {
  let pin: string;
  do {
    pin = String(Math.floor(100000 + Math.random() * 900000));
  } while (games.has(pin));
  return pin;
}
function genId(): string {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function norm(s: string): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
function leaderboard(game: GameState) {
  return [...game.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p) => ({ nickname: p.nickname, score: p.score, lastGain: p.lastGain }));
}
function connectedPlayers(game: GameState) {
  return [...game.players.values()].filter((p) => p.connected);
}
// Host ro'yxati uchun — id bilan (kick qilish imkoni uchun)
function lobbyPlayers(game: GameState) {
  return connectedPlayers(game).map((p) => ({ id: p.playerId, nickname: p.nickname }));
}

// ----- TEST rejimi yordamchilari -----
function testScore(p: GamePlayer, total: number): number {
  return total > 0 ? Math.round((p.correctCount / total) * 100) : 0;
}
// Ball bo'yicha kamayish tartibida; teng bo'lsa, oldin tugatgan yuqorida
function testLeaderboard(game: GameState) {
  const total = game.questionIndices.length;
  return [...game.players.values()]
    .map((p) => ({ p, score: testScore(p, total) }))
    .sort((a, b) => b.score - a.score || (a.p.finishedAt || Infinity) - (b.p.finishedAt || Infinity))
    .map(({ p, score }) => ({
      nickname: p.nickname,
      score,
      lastGain: 0,
      correct: p.correctCount,
      total,
      finished: p.finished,
    }));
}
function finalLeaderboard(game: GameState) {
  return game.mode === "TEST" ? testLeaderboard(game) : leaderboard(game);
}
function testState(game: GameState, player: GamePlayer) {
  const total = game.questionIndices.length;
  if (player.testIndex >= total) {
    // O'quvchiga faqat o'z natijasi — reyting/boshqalar ma'lumoti yuborilmaydi (faqat ustozga)
    return { done: true, correct: player.correctCount, total, score: testScore(player, total) };
  }
  return { done: false, index: player.testIndex, total, slide: buildSlide(game, game.questionIndices[player.testIndex], total) };
}

function buildSlide(game: GameState, idx: number, total?: number) {
  const s = game.slides[idx];
  const base = {
    id: s.id,
    index: idx,
    total: total ?? game.slides.length,
    kind: s.kind,
    type: s.type,
    timeLimit: s.timeLimit,
  };
  const d = s.data ?? {};
  if (s.kind === "CONTENT") {
    // Butun slayd data'sini yuboramiz (kanvas yoki eski format) — klient SlideScene bilan chizadi
    return { ...base, content: d };
  }
  const common = { text: d.text ?? "", imageUrl: d.imageUrl ?? "" };
  switch (s.type) {
    case "OPEN":
      return { ...base, ...common };
    case "FILL_BLANK":
      return { ...base, ...common, blanksCount: (d.blanks ?? []).length };
    case "MATCH": {
      const pairs = d.pairs ?? [];
      return {
        ...base,
        ...common,
        lefts: pairs.map((p: any, i: number) => ({ id: String(i), text: p.left })),
        rights: shuffle(pairs.map((p: any, i: number) => ({ id: String(i), text: p.right }))),
      };
    }
    case "REORDER": {
      const items = d.items ?? [];
      return { ...base, ...common, items: shuffle(items.map((text: string, i: number) => ({ id: String(i), text }))) };
    }
    default: {
      const options = (d.options ?? []).map((o: any, i: number) => ({ id: String(i), text: o.text, imageUrl: o.imageUrl }));
      return { ...base, ...common, options };
    }
  }
}

// Jonli rejim — joriy slayd + taymer tugash vaqti
function publicSlide(game: GameState) {
  return { ...buildSlide(game, game.currentIndex), endsAt: game.timerEndsAt };
}

function correctSummary(s: LoadedSlide, votes: Record<string, number>) {
  const d = s.data ?? {};
  if (s.kind !== "QUESTION") return {};
  if (s.type === "POLL") return { poll: true, voteCounts: votes };
  if (["SINGLE", "MULTIPLE", "TRUE_FALSE", "DROPDOWN"].includes(s.type ?? "")) {
    const correctOptionIds = (d.options ?? [])
      .map((o: any, i: number) => ({ o, i }))
      .filter((x: any) => x.o.isCorrect)
      .map((x: any) => String(x.i));
    return { correctOptionIds, voteCounts: votes };
  }
  if (s.type === "OPEN") return { correctText: (d.answers ?? []).join(", ") };
  if (s.type === "FILL_BLANK") return { correctText: (d.blanks ?? []).map((b: string[]) => b[0] ?? "").join(" | ") };
  if (s.type === "MATCH") return { correctText: (d.pairs ?? []).map((p: any) => `${p.left} → ${p.right}`).join(", ") };
  if (s.type === "REORDER") return { correctText: (d.items ?? []).join(" → ") };
  return {};
}

// Ballash:
//  - to'g'ri javob → 500..1000 ball (tezkor bo'lsa maksimal, vaqt kamaygan sari kamayadi, hech qachon 500 dan past emas)
//  - xato ammo tezkor javob → 0..250 ball (500 dan kam)
//  - vaqt tugagach javob → ~0
const MAX_POINTS = 1000;
const CORRECT_FLOOR = 500;
const WRONG_FAST_MAX = 250;
function scoreAnswer(
  s: LoadedSlide,
  answer: any,
  elapsedMs: number,
  durationMs: number,
): { correct: boolean; points: number } {
  const d = s.data ?? {};
  let correct = false;
  if (s.type === "POLL") return { correct: true, points: 0 };
  if (s.type === "OPEN") {
    const text = norm(String(answer ?? ""));
    correct = (d.answers ?? []).some((a: string) => norm(a) === text);
  } else if (s.type === "FILL_BLANK") {
    const arr: string[] = Array.isArray(answer) ? answer.map(String) : [];
    const blanks: string[][] = d.blanks ?? [];
    correct = blanks.length > 0 && blanks.every((acc, i) => acc.some((a) => norm(a) === norm(arr[i] ?? "")));
  } else if (s.type === "MATCH") {
    const pairs = d.pairs ?? [];
    const map = answer && typeof answer === "object" && !Array.isArray(answer) ? (answer as Record<string, string>) : {};
    correct = pairs.length > 0 && pairs.every((_: any, i: number) => map[String(i)] === String(i));
  } else if (s.type === "REORDER") {
    const items = d.items ?? [];
    const order: string[] = Array.isArray(answer) ? answer.map(String) : [];
    correct = items.length > 0 && order.length === items.length && order.every((id, i) => id === String(i));
  } else {
    const opts = d.options ?? [];
    const correctIds = opts
      .map((o: any, i: number) => ({ o, i }))
      .filter((x: any) => x.o.isCorrect)
      .map((x: any) => String(x.i))
      .sort();
    const selected = Array.isArray(answer) ? answer.map(String) : answer != null ? [String(answer)] : [];
    const sel = [...new Set(selected)].sort();
    correct = correctIds.length === sel.length && correctIds.every((id: string, i: number) => id === sel[i]);
  }
  const ratio = Math.min(Math.max(elapsedMs, 0) / Math.max(durationMs, 1), 1);
  const speed = 1 - ratio; // 1 = darhol, 0 = vaqt tugaganda
  if (correct) {
    return { correct: true, points: CORRECT_FLOOR + Math.round((MAX_POINTS - CORRECT_FLOOR) * speed) };
  }
  return { correct: false, points: Math.round(WRONG_FAST_MAX * speed) };
}

// O'quvchi javobini o'qiladigan matnga aylantirish (hisobot uchun)
function answerToText(s: LoadedSlide, answer: any): string {
  const d = s.data ?? {};
  const opts = d.options ?? [];
  const optText = (id: any) => opts[Number(id)]?.text ?? String(id);
  if (s.type === "OPEN") return String(answer ?? "").trim() || "(bo'sh)";
  if (s.type === "FILL_BLANK") {
    const arr = Array.isArray(answer) ? answer : [answer];
    const t = arr.map((x) => String(x ?? "").trim()).filter(Boolean).join(" | ");
    return t || "(bo'sh)";
  }
  if (s.type === "MATCH") {
    const pairs = d.pairs ?? [];
    if (answer && typeof answer === "object" && !Array.isArray(answer)) {
      const parts = Object.entries(answer as Record<string, string>).map(
        ([l, r]) => `${pairs[Number(l)]?.left ?? l} → ${pairs[Number(r)]?.right ?? r}`,
      );
      return parts.join(", ") || "(bo'sh)";
    }
    return "(bo'sh)";
  }
  if (s.type === "REORDER") {
    const items = d.items ?? [];
    return Array.isArray(answer) ? answer.map((id) => items[Number(id)] ?? id).join(" → ") : "(bo'sh)";
  }
  // variantli savollar
  if (Array.isArray(answer)) return answer.map(optText).join(", ") || "(bo'sh)";
  if (answer === "" || answer == null) return "(bo'sh)";
  return optText(answer);
}

// To'g'ri javobni o'qiladigan matnga aylantirish (hisobot uchun)
function correctToText(s: LoadedSlide): string {
  const cs: any = correctSummary(s, {});
  if (cs.correctText) return cs.correctText;
  if (cs.correctOptionIds) {
    const opts = s.data?.options ?? [];
    return cs.correctOptionIds.map((id: string) => opts[Number(id)]?.text ?? id).join(", ");
  }
  return "";
}

// TEST rejimi — faqat to'g'ri/noto'g'ri (tezlik hisobga olinmaydi)
function checkTestCorrect(s: LoadedSlide, answer: any): boolean {
  // Ochiq savol (qabul qilinadigan javoblar yo'q) — javob yozilgan bo'lsa hisobga olinadi
  if (s.type === "OPEN" && (!(s.data?.answers) || s.data.answers.length === 0)) {
    return String(answer ?? "").trim().length > 0;
  }
  return scoreAnswer(s, answer, 0, 1).correct;
}

async function persistGame(game: GameState) {
  if (game.saved) return;
  game.saved = true;
  if (game.players.size === 0) return;
  try {
    await prisma.gameRecord.create({
      data: {
        teacherId: game.teacherId,
        quizId: game.quizId,
        title: game.title,
        pin: game.pin,
        mode: game.mode,
        totalSlides: game.slides.length,
        questionStats: JSON.stringify([...game.stats.values()]),
        players: {
          create: [...game.players.values()].map((p) => ({
            nickname: p.nickname,
            score: p.score,
            correctCount: p.correctCount,
            totalAnswered: p.totalAnswered,
            details: JSON.stringify(p.testDetails ?? []),
          })),
        },
      },
    });
  } catch (e) {
    console.error("persistGame xato:", e);
  }
}

export function registerGameHandlers(io: Server, socket: Socket) {
  socket.on("host:create", async (data: { token: string; quizId: string }, cb?: (r: unknown) => void) => {
    const teacherId = verifyToken(data?.token ?? "");
    if (!teacherId) {
      cb?.({ error: "Avtorizatsiya kerak" });
      return;
    }
    // Har qanday kirgan ustoz istalgan quizni host qila oladi (link orqali ulashish uchun).
    // teacherId = host qiluvchi (taqdimotchi) — hisobot unga tegishli; quiz egasi o'zgarmaydi.
    const quiz = await prisma.quiz.findUnique({
      where: { id: data.quizId },
      include: { slides: { orderBy: { order: "asc" } } },
    });
    if (!quiz || quiz.slides.length === 0) {
      cb?.({ error: "Quiz topilmadi yoki bo'sh" });
      return;
    }
    const slides: LoadedSlide[] = quiz.slides.map((s) => {
      let parsed: any = {};
      try {
        parsed = JSON.parse(s.data);
      } catch {
        parsed = {};
      }
      return { id: s.id, kind: s.kind, type: s.type, data: parsed, timeLimit: s.timeLimit, points: s.points };
    });
    const pin = genPin();
    games.set(pin, {
      pin,
      hostSocketId: socket.id,
      teacherId,
      quizId: quiz.id,
      title: quiz.title,
      slides,
      mode: "LIVE",
      questionIndices: [],
      currentIndex: -1,
      status: "lobby",
      players: new Map(),
      questionStartedAt: 0,
      timerEndsAt: 0,
      timer: null,
      hostGraceTimer: null,
      votes: {},
      stats: new Map(),
      saved: false,
      settings: defaultSettings(),
    });
    socket.join(pin);
    socket.data.role = "host";
    socket.data.pin = pin;
    cb?.({ pin, title: quiz.title, total: slides.length, settings: defaultSettings() });
  });

  // Lobby'da sozlamalarni yangilash
  socket.on("host:settings", (data: { pin: string; settings: Partial<GameSettings> }, cb?: (r: unknown) => void) => {
    const game = games.get(data?.pin);
    if (!game || game.hostSocketId !== socket.id) {
      cb?.({ error: "O'yin topilmadi" });
      return;
    }
    if (game.status !== "lobby") {
      cb?.({ error: "O'yin allaqachon boshlangan" });
      return;
    }
    game.settings = { ...game.settings, ...(data.settings ?? {}) };
    io.to(game.pin).emit("game:settings", clientSettings(game));
    cb?.({ ok: true, settings: game.settings });
  });

  // Host qayta ulanishi (sahifa yangilansa)
  socket.on("host:resume", (data: { pin: string; token: string }, cb?: (r: unknown) => void) => {
    const teacherId = verifyToken(data?.token ?? "");
    const game = games.get(data?.pin);
    if (!game || !teacherId || game.teacherId !== teacherId) {
      cb?.({ error: "O'yin topilmadi" });
      return;
    }
    game.hostSocketId = socket.id;
    // Sahifa yangilandi — grace timerni bekor qilamiz, o'yin davom etadi
    if (game.hostGraceTimer) {
      clearTimeout(game.hostGraceTimer);
      game.hostGraceTimer = null;
    }
    socket.join(game.pin);
    socket.data.role = "host";
    socket.data.pin = game.pin;
    cb?.({
      pin: game.pin,
      title: game.title,
      total: game.slides.length,
      status: game.status,
      mode: game.mode,
      settings: game.settings,
      players: lobbyPlayers(game),
      slide:
        game.mode === "LIVE" && (game.status === "active" || game.status === "reveal") ? publicSlide(game) : null,
    });
    if (game.mode === "TEST" && game.status === "active") emitTestProgress(game);
  });

  socket.on("player:join", (data: { pin: string; nickname: string }, cb?: (r: unknown) => void) => {
    const game = games.get(data?.pin);
    if (!game) {
      cb?.({ error: "Bunday kod topilmadi" });
      return;
    }
    // O'yin yakunlangan bo'lsagina qo'shilishni rad etamiz.
    // Lobby YOKI boshlangan (active/reveal) o'yinga ham kechikib qo'shilsa bo'ladi.
    if (game.status === "ended") {
      cb?.({ error: "O'yin yakunlangan" });
      return;
    }
    const nickname = (data.nickname ?? "").trim().slice(0, 20) || "O'quvchi";
    const playerId = genId();
    const player: GamePlayer = {
      playerId,
      socketId: socket.id,
      nickname,
      score: 0,
      lastGain: 0,
      answeredCurrent: false,
      connected: true,
      correctCount: 0,
      totalAnswered: 0,
      answeredIndices: [],
      flags: 0,
      testIndex: 0,
      finished: false,
      finishedAt: 0,
      qStartedAt: 0,
      testDetails: [],
    };
    game.players.set(playerId, player);
    socket.join(data.pin);
    socket.data.role = "player";
    socket.data.pin = data.pin;
    socket.data.playerId = playerId;
    cb?.({ ok: true, playerId, settings: clientSettings(game), status: game.status, mode: game.mode });
    io.to(game.hostSocketId).emit("lobby:update", { players: lobbyPlayers(game) });
    // Kech qo'shilgan o'quvchini darhol jonli o'yinga/testga tushiramiz
    if (game.status !== "lobby") {
      if (game.mode === "TEST") {
        player.qStartedAt = Date.now();
        socket.emit("test:begin", { total: game.questionIndices.length });
        emitTestProgress(game);
      } else {
        socket.emit("slide:show", publicSlide(game));
      }
    }
  });

  // O'quvchi qayta ulanishi
  socket.on("player:rejoin", (data: { pin: string; playerId: string }, cb?: (r: unknown) => void) => {
    const game = games.get(data?.pin);
    const player = game?.players.get(data?.playerId);
    if (!game || !player) {
      cb?.({ error: "O'yin topilmadi" });
      return;
    }
    player.socketId = socket.id;
    player.connected = true;
    socket.join(game.pin);
    socket.data.role = "player";
    socket.data.pin = game.pin;
    socket.data.playerId = player.playerId;
    cb?.({
      ok: true,
      playerId: player.playerId,
      nickname: player.nickname,
      score: player.score,
      status: game.status,
      mode: game.mode,
      settings: clientSettings(game),
    });
    io.to(game.hostSocketId).emit("lobby:update", { players: lobbyPlayers(game) });
    if (game.status === "active") {
      if (game.mode === "TEST") socket.emit("test:begin", { total: game.questionIndices.length });
      else socket.emit("slide:show", publicSlide(game));
    } else if (game.status === "ended") {
      socket.emit("game:ended", { leaderboard: finalLeaderboard(game) });
    }
  });

  function clearGameTimer(game: GameState) {
    if (game.timer) {
      clearTimeout(game.timer);
      game.timer = null;
    }
  }

  function scheduleTimer(game: GameState) {
    clearGameTimer(game);
    const ms = Math.max(game.timerEndsAt - Date.now(), 0);
    game.timer = setTimeout(() => {
      game.timer = null;
      if (game.status === "active") revealCurrent(game);
    }, ms);
  }

  function showCurrent(game: GameState) {
    clearGameTimer(game);
    game.status = "active";
    game.questionStartedAt = Date.now();
    game.votes = {};
    game.players.forEach((p) => (p.answeredCurrent = false));
    const s = game.slides[game.currentIndex];
    if (s.kind === "QUESTION") {
      if (!game.stats.has(game.currentIndex)) {
        game.stats.set(game.currentIndex, {
          index: game.currentIndex,
          text: s.data?.text ?? `Savol ${game.currentIndex + 1}`,
          correct: 0,
          total: 0,
        });
      }
      // Savol taymeri yoqilgan bo'lsagina avtomatik hisoblash/yopilish
      if (game.settings.questionTimer) {
        game.timerEndsAt = Date.now() + s.timeLimit * 1000;
        scheduleTimer(game);
      } else {
        game.timerEndsAt = 0;
      }
    } else {
      game.timerEndsAt = 0;
    }
    io.to(game.pin).emit("slide:show", publicSlide(game));
  }

  function revealCurrent(game: GameState) {
    if (game.status === "reveal") return;
    clearGameTimer(game);
    game.timerEndsAt = 0;
    game.status = "reveal";
    const s = game.slides[game.currentIndex];
    io.to(game.pin).emit("slide:results", {
      ...correctSummary(s, game.votes),
      leaderboard: leaderboard(game),
    });
  }

  function emitTestProgress(game: GameState) {
    const total = game.questionIndices.length;
    io.to(game.hostSocketId).emit("test:progress", {
      total,
      players: [...game.players.values()].map((p) => ({
        id: p.playerId,
        nickname: p.nickname,
        answered: Math.min(p.testIndex, total),
        score: testScore(p, total),
        correct: p.correctCount,
        finished: p.finished,
        flags: p.flags,
        connected: p.connected,
      })),
    });
  }

  socket.on("host:start", (data: { pin: string; mode?: "LIVE" | "TEST" }) => {
    const game = games.get(data?.pin);
    if (!game || game.hostSocketId !== socket.id) return;
    game.mode = data?.mode === "TEST" ? "TEST" : "LIVE";

    if (game.mode === "TEST") {
      // Faqat baholanadigan savollar (POLL'siz)
      game.questionIndices = game.slides
        .map((s, i) => ({ s, i }))
        .filter((x) => x.s.kind === "QUESTION" && x.s.type !== "POLL")
        .map((x) => x.i);
      if (game.questionIndices.length === 0) return;
      game.status = "active";
      game.players.forEach((p) => {
        p.testIndex = 0;
        p.finished = false;
        p.finishedAt = 0;
        p.correctCount = 0;
        p.totalAnswered = 0;
        p.score = 0;
        p.answeredIndices = [];
        p.testDetails = [];
        p.qStartedAt = Date.now();
      });
      io.to(game.pin).emit("test:begin", { total: game.questionIndices.length });
      emitTestProgress(game);
      return;
    }

    game.currentIndex = 0;
    showCurrent(game);
  });

  // TEST: o'quvchi joriy savolini oladi (yoki tugagan bo'lsa natija)
  socket.on("test:get", (data: { pin: string }, cb?: (r: unknown) => void) => {
    const game = games.get(data?.pin);
    if (!game || game.mode !== "TEST") {
      cb?.({ error: "Test topilmadi" });
      return;
    }
    const player = game.players.get(socket.data.playerId);
    if (!player) {
      cb?.({ error: "O'quvchi topilmadi" });
      return;
    }
    cb?.(testState(game, player));
  });

  // TEST: o'quvchi javob beradi → keyingi savol (yoki natija) qaytadi
  socket.on("test:answer", (data: { pin: string; answer: any }, cb?: (r: unknown) => void) => {
    const game = games.get(data?.pin);
    if (!game || game.mode !== "TEST" || game.status !== "active") {
      cb?.({ error: "Faol test yo'q" });
      return;
    }
    const player = game.players.get(socket.data.playerId);
    if (!player || player.finished) {
      cb?.({ error: "Test tugagan" });
      return;
    }
    const total = game.questionIndices.length;
    if (player.testIndex < total) {
      const s = game.slides[game.questionIndices[player.testIndex]];
      const correct = checkTestCorrect(s, data.answer);
      const timeMs = player.qStartedAt ? Math.max(0, Date.now() - player.qStartedAt) : 0;
      player.testDetails.push({
        index: player.testIndex,
        text: s.data?.text ?? `Savol ${player.testIndex + 1}`,
        answer: answerToText(s, data.answer),
        correct,
        timeMs,
        correctAns: correctToText(s),
      });
      if (correct) player.correctCount += 1;
      player.totalAnswered += 1;
      player.testIndex += 1;
      player.qStartedAt = Date.now(); // keyingi savol uchun vaqt boshlanadi
      if (player.testIndex >= total) {
        player.finished = true;
        player.finishedAt = Date.now();
      }
      player.score = testScore(player, total);
    }
    emitTestProgress(game);
    cb?.(testState(game, player));
  });

  socket.on("host:next", async (data: { pin: string }) => {
    const game = games.get(data?.pin);
    if (!game || game.hostSocketId !== socket.id) return;
    if (game.currentIndex + 1 >= game.slides.length) {
      clearGameTimer(game);
      game.status = "ended";
      await persistGame(game);
      io.to(game.pin).emit("game:ended", { leaderboard: finalLeaderboard(game) });
      return;
    }
    game.currentIndex += 1;
    showCurrent(game);
  });

  // Taqdimotni butunlay yakunlash (host "End Presentation" bossa)
  socket.on("host:end", async (data: { pin: string }) => {
    const game = games.get(data?.pin);
    if (!game || game.hostSocketId !== socket.id) return;
    clearGameTimer(game);
    game.status = "ended";
    await persistGame(game);
    io.to(game.pin).emit("game:ended", { leaderboard: finalLeaderboard(game) });
    games.delete(game.pin);
  });

  socket.on("host:fullscreen", (data: { pin: string }) => {
    const game = games.get(data?.pin);
    if (!game || game.hostSocketId !== socket.id) return;
    socket.to(game.pin).emit("present:fullscreen");
  });

  socket.on("host:prev", (data: { pin: string }) => {
    const game = games.get(data?.pin);
    if (!game || game.hostSocketId !== socket.id) return;
    if (game.currentIndex <= 0) return;
    game.currentIndex -= 1;
    showCurrent(game);
  });

  // Host o'quvchini o'yindan chiqaradi (kick)
  socket.on("host:kick", (data: { pin: string; playerId: string }) => {
    const game = games.get(data?.pin);
    if (!game || game.hostSocketId !== socket.id) return;
    const player = game.players.get(data?.playerId);
    if (!player) return;
    const kickedSocketId = player.socketId;
    game.players.delete(data.playerId);
    // Chiqarilgan o'quvchiga xabar beramiz va o'yindan uzamiz
    io.to(kickedSocketId).emit("player:kicked");
    const ks = io.sockets.sockets.get(kickedSocketId);
    if (ks) {
      ks.leave(game.pin);
      ks.data.pin = undefined;
      ks.data.playerId = undefined;
    }
    // Ro'yxatlarni yangilaymiz (jonli va test rejimi)
    io.to(game.hostSocketId).emit("lobby:update", { players: lobbyPlayers(game) });
    if (game.mode === "TEST") emitTestProgress(game);
  });

  socket.on("host:reveal", (data: { pin: string }) => {
    const game = games.get(data?.pin);
    if (!game || game.hostSocketId !== socket.id) return;
    revealCurrent(game);
  });

  // Taymerni boshqarish — vaqt qo'shish (+/- soniya)
  socket.on("host:addTime", (data: { pin: string; seconds: number }) => {
    const game = games.get(data?.pin);
    if (!game || game.hostSocketId !== socket.id || game.status !== "active") return;
    const delta = Math.round(Number(data?.seconds) || 0) * 1000;
    if (!delta) return;
    // Joriy vaqtdan kamida 1 soniya qolsin
    game.timerEndsAt = Math.max(game.timerEndsAt + delta, Date.now() + 1000);
    scheduleTimer(game);
    io.to(game.pin).emit("timer:update", { endsAt: game.timerEndsAt });
  });

  // Taymerni darhol tugatish → natijani ochish
  socket.on("host:endTimer", (data: { pin: string }) => {
    const game = games.get(data?.pin);
    if (!game || game.hostSocketId !== socket.id || game.status !== "active") return;
    revealCurrent(game);
  });

  socket.on("player:answer", (data: { pin: string; answer: any }) => {
    const game = games.get(data?.pin);
    if (!game || game.status !== "active") return;
    const player = game.players.get(socket.data.playerId);
    if (!player || player.answeredCurrent) return;
    const s = game.slides[game.currentIndex];
    if (s.kind !== "QUESTION") return;

    const idx = game.currentIndex;
    const elapsed = Date.now() - game.questionStartedAt;
    const duration = (game.timerEndsAt || game.questionStartedAt + s.timeLimit * 1000) - game.questionStartedAt;
    const { correct, points } = scoreAnswer(s, data.answer, elapsed, duration);

    // Bu savolga avval javob bergan bo'lsa — ball qayta qo'shilmaydi
    if (player.answeredIndices.includes(idx)) {
      player.answeredCurrent = true;
      socket.emit("answer:received", { correct, points: 0, score: player.score });
      return;
    }
    player.answeredIndices.push(idx);
    player.answeredCurrent = true;
    player.lastGain = points;
    player.score += points;
    player.totalAnswered += 1;
    if (correct) player.correctCount += 1;

    const stat = game.stats.get(game.currentIndex);
    if (stat) {
      stat.total += 1;
      if (correct) stat.correct += 1;
    }
    const tally = (id: string) => {
      game.votes[id] = (game.votes[id] ?? 0) + 1;
    };
    if (Array.isArray(data.answer)) data.answer.forEach((id) => tally(String(id)));
    else if (typeof data.answer === "string" || typeof data.answer === "number") tally(String(data.answer));

    socket.emit("answer:received", { correct, points, score: player.score });
    const answeredList = connectedPlayers(game).filter((p) => p.answeredCurrent);
    io.to(game.hostSocketId).emit("question:progress", {
      answered: answeredList.length,
      total: connectedPlayers(game).length,
      answeredNames: answeredList.map((p) => p.nickname),
    });
  });

  // Anti-cheat: o'quvchi fullscreen'dan chiqdi / boshqa tabga o'tdi
  socket.on("player:flag", (data: { pin: string; type: string }) => {
    const game = games.get(data?.pin);
    if (!game || !game.settings.antiCheat) return;
    const player = game.players.get(socket.data.playerId);
    if (!player) return;
    player.flags += 1;
    io.to(game.hostSocketId).emit("host:flag", {
      nickname: player.nickname,
      count: player.flags,
      type: data?.type ?? "unknown",
    });
  });

  socket.on("disconnect", async () => {
    const pin = socket.data.pin as string | undefined;
    if (!pin) return;
    const game = games.get(pin);
    if (!game) return;

    if (socket.data.role === "host" && game.hostSocketId === socket.id) {
      // Host uzildi — sahifa yangilangan bo'lishi mumkin. Darhol tugatmaymiz:
      // grace davri beramiz. Shu vaqtda host:resume kelsa, davom etadi.
      // Savol taymeri ham ishlab turaveradi (auto-reveal yo'qolmaydi).
      if (game.hostGraceTimer) clearTimeout(game.hostGraceTimer);
      game.hostGraceTimer = setTimeout(async () => {
        game.hostGraceTimer = null;
        // Hali ham shu (eski) socket host bo'lsa — demak qaytmadi → tugatamiz
        if (game.hostSocketId !== socket.id) return;
        clearGameTimer(game);
        await persistGame(game);
        io.to(game.pin).emit("game:ended", { leaderboard: finalLeaderboard(game), hostLeft: true });
        games.delete(game.pin);
      }, 30 * 60 * 1000); // 30 daqiqa kutamiz — ustoz internet uzilsa ham dars o'chmaydi,
      // qaytib kirsa kelgan joyidan davom ettiradi
      return;
    }
    if (socket.data.role === "player") {
      const player = game.players.get(socket.data.playerId);
      if (!player) return;
      if (game.status === "lobby") {
        game.players.delete(socket.data.playerId);
      } else {
        player.connected = false;
      }
      io.to(game.hostSocketId).emit("lobby:update", { players: lobbyPlayers(game) });
    }
  });
}
