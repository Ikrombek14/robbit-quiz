import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { getSocket } from "../socket";
import type { LeaderRow, SlideData } from "../types";
import SlideScene from "../components/SlideScene";
import TestRunner from "../components/TestRunner";
import TypingRace, { type TypingRow } from "../components/TypingRace";
import { randomFact } from "../facts";

// Lobby'da tanlanadigan avatarlar — backend bilan bir xil to'plam (game.ts AVATARS)
const AVATARS = ["🤖", "👾", "🦾", "🛸", "🚀", "⚡", "🧠", "🎮", "🦊", "🐼", "🦁", "🐸"];

type Phase = "form" | "lobby" | "content" | "question" | "answered" | "reveal" | "ended" | "test" | "kicked";

interface PublicSlide {
  id: string;
  index: number;
  total: number;
  kind: string;
  type: string | null;
  timeLimit?: number;
  endsAt?: number;
  now?: number; // server soati — endsAt'ni mijoz soatiga o'girish uchun
  content?: SlideData;
  text?: string;
  imageUrl?: string;
  options?: { id: string; text: string; imageUrl?: string }[];
  blanksCount?: number;
  lefts?: { id: string; text: string }[];
  rights?: { id: string; text: string }[];
  items?: { id: string; text: string }[];
}
interface Results {
  correctOptionIds?: string[];
  correctText?: string;
  poll?: boolean;
  leaderboard: LeaderRow[];
}

/* Server va mijoz (o'quvchi telefoni) soati farq qilishi mumkin — endsAt'ni server
   yuborgan "now" bilan mijoz soatiga o'giramiz, aks holda taymer noto'g'ri sanaydi */
function toLocalEnds(ends?: number, serverNow?: number): number {
  if (!ends) return 0;
  return serverNow ? Date.now() + (ends - serverNow) : ends;
}

export default function Join() {
  const [params] = useSearchParams();
  const { teacher: account } = useAuth(); // account bilan kirgan bo'lsa ism so'ralmaydi
  const [pin, setPin] = useState(params.get("pin") ?? params.get("gc") ?? "");
  const [nickname, setNickname] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [error, setError] = useState("");
  const [slide, setSlide] = useState<PublicSlide | null>(null);
  const [result, setResult] = useState<{ correct: boolean; points: number; score: number } | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [score, setScore] = useState(0);
  const [stuSettings, setStuSettings] = useState({ antiCheat: false, disableRightClick: false, serious: false });
  const [warn, setWarn] = useState("");
  const [gameMode, setGameMode] = useState<"LIVE" | "TEST">("LIVE");
  const [practiceEndsAt, setPracticeEndsAt] = useState(0); // amaliyot (mashq) taymeri

  // Lobby o'yin-kulgi: avatar, typing reytingi; kutish ekranida qiziqarli fakt
  const [avatar, setAvatar] = useState("");
  const [typingRows, setTypingRows] = useState<TypingRow[]>([]);
  const [typingTotalBonus, setTypingTotalBonus] = useState(0); // serverda jamlangan typing bonusi
  const [fact, setFact] = useState("");

  // interaktiv javob holatlari
  const [selected, setSelected] = useState<string[]>([]);
  const [openText, setOpenText] = useState("");
  const [fillVals, setFillVals] = useState<string[]>([]);
  const [matchMap, setMatchMap] = useState<Record<string, string>>({});
  const [reorder, setReorder] = useState<{ id: string; text: string }[]>([]);

  // Reconnect'dan keyin joriy savolga allaqachon javob berilgan bo'lsa — slide:show
  // kelganda savolni qayta ochmasdan "javob qabul qilindi" ekranida qolamiz
  const answeredCurrentRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();
    const onSlide = (s: PublicSlide) => {
      setSlide(s);
      setResult(null);
      setResults(null);
      setEndsAt(toLocalEnds(s.endsAt, s.now));
      setPracticeEndsAt(0); // yangi slaydda amaliyot taymeri tugaydi
      if (answeredCurrentRef.current && s.kind !== "CONTENT") {
        answeredCurrentRef.current = false;
        setPhase("answered");
      } else {
        answeredCurrentRef.current = false;
        setPhase(s.kind === "CONTENT" ? "content" : "question");
      }
    };
    const onPractice = (d: { endsAt: number; now?: number }) => setPracticeEndsAt(toLocalEnds(d.endsAt, d.now));
    const onReceived = (r: { correct: boolean; points: number; score: number }) => {
      setResult(r);
      setScore(r.score);
    };
    // Server: bu savolga allaqachon javob bergansiz — qayta bosish mumkin emas.
    // (host savolga qaytdi/qayta ochdi yoki o'quvchi qayta kirdi)
    const onLocked = () => {
      answeredCurrentRef.current = false;
      setPhase("answered");
    };
    const onTimer = (d: { endsAt: number; now?: number }) => setEndsAt(toLocalEnds(d.endsAt, d.now));
    const onResults = (d: Results) => {
      setResults(d);
      setEndsAt(0);
      setPhase("reveal");
    };
    const onEnded = (d: { leaderboard: LeaderRow[]; hostLeft?: boolean }) => {
      setResults({ leaderboard: d.leaderboard });
      if (d.hostLeft) setError("O'qituvchi o'yindan chiqdi");
      setPhase("ended");
      sessionStorage.removeItem("player");
    };
    const onFs = () => {
      document.documentElement.requestFullscreen?.().catch(() => {});
    };
    const onSettings = (s: { antiCheat: boolean; disableRightClick: boolean; serious: boolean }) => setStuSettings(s);
    const onKicked = () => {
      sessionStorage.removeItem("player");
      setError("Sizni o'qituvchi o'yindan chiqardi");
      setPhase("kicked");
    };
    const onTestBegin = () => {
      setGameMode("TEST");
      setPhase("test");
    };
    const onTypingBoard = (d: { rows: TypingRow[] }) => setTypingRows(d.rows ?? []);
    // O'yin boshlanganda typing bonusi qo'shildi — umumiy ballni yangilaymiz
    const onTypingBonus = (d: { bonus: number; score: number }) => setScore(d.score);
    socket.on("typing:bonus", onTypingBonus);
    socket.on("typing:board", onTypingBoard);
    socket.on("test:begin", onTestBegin);
    socket.on("slide:show", onSlide);
    socket.on("answer:received", onReceived);
    socket.on("answer:locked", onLocked);
    socket.on("timer:update", onTimer);
    socket.on("slide:results", onResults);
    socket.on("game:ended", onEnded);
    socket.on("present:fullscreen", onFs);
    socket.on("game:settings", onSettings);
    socket.on("player:kicked", onKicked);
    socket.on("practice:timer", onPractice);
    return () => {
      socket.off("typing:bonus", onTypingBonus);
      socket.off("typing:board", onTypingBoard);
      socket.off("slide:show", onSlide);
      socket.off("answer:received", onReceived);
      socket.off("answer:locked", onLocked);
      socket.off("timer:update", onTimer);
      socket.off("slide:results", onResults);
      socket.off("game:ended", onEnded);
      socket.off("present:fullscreen", onFs);
      socket.off("game:settings", onSettings);
      socket.off("test:begin", onTestBegin);
      socket.off("player:kicked", onKicked);
      socket.off("practice:timer", onPractice);
    };
  }, []);

  // O'ng tugmani o'chirish
  useEffect(() => {
    if (!stuSettings.disableRightClick) return;
    const block = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", block);
    return () => document.removeEventListener("contextmenu", block);
  }, [stuSettings.disableRightClick]);

  // Anti-cheat: fullscreen'dan chiqish / boshqa tabga o'tishni kuzatish
  useEffect(() => {
    if (!stuSettings.antiCheat) return;
    const flag = (type: string, msg: string) => {
      getSocket().emit("player:flag", { pin, type });
      setWarn(msg);
    };
    const onVis = () => { if (document.hidden) flag("tab", "⚠️ Boshqa oynaga o'tdingiz! O'qituvchi xabardor qilindi."); };
    const onFsExit = () => { if (!document.fullscreenElement) flag("fullscreen", "⚠️ To'liq ekrandan chiqdingiz! O'qituvchi xabardor qilindi."); };
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("fullscreenchange", onFsExit);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("fullscreenchange", onFsExit);
    };
  }, [stuSettings.antiCheat, pin]);

  // ogohlantirishni avtomatik yashirish
  useEffect(() => {
    if (!warn) return;
    const t = setTimeout(() => setWarn(""), 3500);
    return () => clearTimeout(t);
  }, [warn]);

  // Taymer tiki — FAQAT countdown faol bo'lganda (savol yoki amaliyot taymeri).
  // Kutish/tugagan holatlarda o'quvchi telefonida tekin 4-render/sekund bo'lmasin.
  useEffect(() => {
    if (endsAt <= 0 && practiceEndsAt <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt, practiceEndsAt]);

  // Saqlangan sessiya bo'yicha o'yinga qaytish (refresh yoki socket reconnect).
  // silent=true — reconnect: xato bo'lsa sessiyani o'chirmaymiz (vaqtinchalik uzilish bo'lishi mumkin).
  function rejoinFromStorage(silent = false) {
    const raw = sessionStorage.getItem("player");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { pin: string; playerId: string; nickname: string };
      setPin(saved.pin);
      if (!silent) setNickname(saved.nickname);
      getSocket().emit("player:rejoin", { pin: saved.pin, playerId: saved.playerId }, (r: any) => {
        if (r.error) {
          // Server javob berdi — demak aloqa bor va o'yin haqiqatan yo'q (tugagan yoki
          // server qayta ishga tushib snapshot muddati o'tgan). Jimgina qotib
          // qolmasin: sessiyani tozalab kirish formasiga qaytaramiz. (Vaqtinchalik
          // uzilishda callback umuman kelmaydi, shuning uchun bu xavfsiz.)
          sessionStorage.removeItem("player");
          if (r.error !== "O'yin topilmadi") setError(r.error); // kick kabi aniq sabab bo'lsa ko'rsatamiz
          setPhase("form");
          return;
        }
        setNickname(r.nickname ?? saved.nickname);
        if (typeof r.score === "number") setScore(r.score);
        if (r.settings) setStuSettings(r.settings);
        // Joriy savolga javob berilgan bo'lsa — keladigan slide:show savolni qayta ochmaydi
        answeredCurrentRef.current = r.answered === true;
        if (r.status === "ended") setPhase("ended");
        else if (r.status === "lobby") setPhase("lobby");
        // active bo'lsa phase'ni server yuboradigan slide:show / test:begin o'zi o'rnatadi
      });
    } catch {
      sessionStorage.removeItem("player");
    }
  }

  // Qayta ulanish — FAQAT o'sha tabda sahifa yangilansa o'yinga qaytadi.
  // sessionStorage ishlatamiz (localStorage EMAS): u har tab uchun alohida va
  // brauzer/tab yopilganda o'chadi — shuning uchun brauzerni yopib yangi oynada
  // kod terganda eski o'yinga avtomatik kirib qolish muammosi bo'lmaydi.
  useEffect(() => {
    // Avvalgi versiyadan localStorage'da qolgan sessiyani tozalaymiz (u oynalar
    // orasida umumiy bo'lgani uchun aynan shu bug manbai edi).
    try { localStorage.removeItem("player"); } catch { /* ignore */ }
    // Yangi o'yin havolasi (?pin=) bilan kelingan va saqlangan sessiya boshqa
    // o'yinniki bo'lsa — eski o'yinga tortmaymiz (yangi kodga ustunlik beramiz).
    const urlPin = params.get("pin") ?? params.get("gc");
    if (urlPin) {
      try {
        const raw = sessionStorage.getItem("player");
        if (raw && JSON.parse(raw).pin !== urlPin) return;
      } catch { /* ignore */ }
    }
    rejoinFromStorage(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MUHIM: socket uzilib qayta ulanganda (yangi socket.id) server bizni tanimay
  // qoladi va hech narsa kelmaydi — o'quvchi "qotib qoladi". Har reconnect'da
  // avtomatik qayta ro'yxatdan o'tamiz, o'yin kelgan joyidan davom etadi.
  useEffect(() => {
    const socket = getSocket();
    const onReconnect = () => rejoinFromStorage(true);
    socket.io.on("reconnect", onReconnect);
    return () => { socket.io.off("reconnect", onReconnect); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Account bilan kirganlar o'yinga o'z ismi bilan qatnashadi (natijalar
  // /profile sahifasiga to'g'ri bog'lanishi uchun ham shu ism kerak)
  useEffect(() => {
    if (account && phase === "form") setNickname(account.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  // Yangi savol — javob holatlarini tiklash
  useEffect(() => {
    setSelected([]);
    setOpenText("");
    setFillVals(slide?.blanksCount ? Array(slide.blanksCount).fill("") : []);
    setMatchMap({});
    setReorder(slide?.items ? [...slide.items] : []);
  }, [slide]);

  function join(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    getSocket().emit(
      "player:join",
      { pin, nickname },
      (r: { ok?: boolean; playerId?: string; nickname?: string; error?: string; settings?: typeof stuSettings; answered?: boolean }) => {
        if (r.error) {
          setError(r.error);
          return;
        }
        if (r.settings) setStuSettings(r.settings);
        // Server ismni o'zgartirgan bo'lishi mumkin: shu nom band bo'lsa "(2)", "(3)"…
        // qo'shib beradi. O'z natijamizni to'g'ri topish uchun aynan o'shani ishlatamiz.
        const finalName = r.nickname ?? nickname;
        setNickname(finalName);
        sessionStorage.setItem("player", JSON.stringify({ pin, playerId: r.playerId, nickname: finalName }));
        // Shu nom bilan avval kirgan va joriy savolga javob bergan bo'lsa —
        // keladigan slide:show savolni qayta ochmaydi (qayta bosa olmaydi)
        answeredCurrentRef.current = r.answered === true;
        setPhase("lobby");
      },
    );
  }

  function submit(answer: unknown) {
    getSocket().emit("player:answer", { pin, answer });
    setPhase("answered");
  }

  // Javobdan keyin kutish ekranida qiziqarli fakt — har 8 soniyada yangilanadi
  useEffect(() => {
    if (phase !== "answered") return;
    setFact((f) => randomFact(f));
    const id = setInterval(() => setFact((f) => randomFact(f)), 8000);
    return () => clearInterval(id);
  }, [phase]);

  // Lobby'da avatar tanlash — serverga yuboriladi, host ro'yxatida ko'rinadi
  function pickAvatar(a: string) {
    setAvatar(a);
    getSocket().emit("player:avatar", { pin, avatar: a });
  }

  function toggleFs() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }

  // Amaliyot (mashq) taymeri bannerini barcha ekranlarda ko'rsatamiz
  const pracLeft = practiceEndsAt ? Math.max(0, practiceEndsAt - now) : 0;
  const pracSecs = Math.ceil(pracLeft / 1000);
  const pracBanner =
    practiceEndsAt > 0 && pracLeft > 0 ? (
      <div className={`stu-prac-banner ${pracSecs <= 5 ? "low" : ""}`}>
        <span className="material-symbols-outlined">timer</span>
        {Math.floor(pracSecs / 60)}:{String(pracSecs % 60).padStart(2, "0")}
      </div>
    ) : null;

  // ---------- Form ----------
  if (phase === "form")
    return (
      <div className="center-screen">
        <div className="card card-narrow">
          <h2 style={{ marginTop: 0 }}>O'yinga qo'shilish</h2>
          {error && <div className="error">{error}</div>}
          <form onSubmit={join}>
            <label>Kod</label>
            <input
              className="pin-input"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="------"
              inputMode="numeric"
              autoComplete="off"
            />
            {account ? (
              <p className="muted" style={{ margin: "0 0 12px" }}>
                Siz <b>{account.name}</b> nomi bilan qatnashasiz
              </p>
            ) : (
              <>
                <label>Ismingiz</label>
                <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={40}
                  autoComplete="off" enterKeyHint="go" placeholder="Masalan: Ali" />
              </>
            )}
            <button className="btn btn-block" type="submit" disabled={pin.length !== 6 || !nickname.trim()}>
              Kirish
            </button>
          </form>
        </div>
      </div>
    );

  if (phase === "lobby")
    return (
      <div className="stu-lobby">
        {pracBanner}
        <div className="stu-lobby-head">
          <h2 style={{ margin: 0 }}>✅ Qo'shildingiz!</h2>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Salom, {avatar ? `${avatar} ` : ""}{nickname}! Boshlanishini kuting…
          </p>
        </div>

        {/* Avatar tanlash — host ekranidagi ro'yxatda ko'rinadi */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>O'z belgingni tanla:</div>
          <div className="stu-ava-row">
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => pickAvatar(a)}
                aria-label={`Avatar ${a}`}
                className={`stu-ava-btn ${avatar === a ? "on" : ""}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Tezkor yozish musobaqasi — butun ekran bo'ylab */}
        <TypingRace
          board={typingRows}
          myName={nickname}
          totalBonus={typingTotalBonus}
          onFinish={(wpm, acc) =>
            getSocket().emit("player:typing", { pin, wpm, acc }, (r?: { totalBonus?: number }) => {
              // Server javobi — jamlangan bonus (har poyga qo'shib boradi, jami 300 gacha)
              if (typeof r?.totalBonus === "number") setTypingTotalBonus(r.totalBonus);
            })
          }
        />
      </div>
    );

  if (phase === "kicked")
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          <h1>🚪 O'yindan chiqarildingiz</h1>
          <p className="muted">{error || "Sizni o'qituvchi o'yindan chiqardi"}</p>
        </div>
      </div>
    );

  if (phase === "test")
    return (
      <>
        {warn && <div className="cheat-warn">{warn}</div>}
        <TestRunner pin={pin} nickname={nickname} />
      </>
    );

  if (phase === "content" && slide)
    return (
      <div className="stu-present">
        {pracBanner}
        {warn && <div className="cheat-warn">{warn}</div>}
        <div className="stu-top">
          <div className="stu-top-left">
            <span className="material-symbols-outlined" style={{ color: "var(--primary)" }}>rocket_launch</span>
            {!stuSettings.serious && (
              <span className="stu-score">
                <span className="material-symbols-outlined">stars</span>
                {score}
              </span>
            )}
          </div>
          <div className="stu-slidenum">Slayd {slide.index + 1}/{slide.total}</div>
          <div className="stu-top-right">
            <span className="stu-code">{pin}</span>
            <button className="stu-icon-btn" onClick={toggleFs} title="To'liq ekran">
              <span className="material-symbols-outlined">fullscreen</span>
            </button>
          </div>
        </div>

        <div className="stu-stage">
          <div className="stu-slide">
            <SlideScene data={slide.content ?? {}} rounded={14} />
          </div>
        </div>

        <div className="stu-foot">
          <div className="stu-ava">{(nickname?.[0] ?? "?").toUpperCase()}</div>
          <div className="stu-name">
            {nickname}
            <div className="muted" style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>O'qituvchi tushuntirmoqda…</div>
          </div>
        </div>
      </div>
    );

  if (phase === "question" && slide) {
    const t = slide.type;
    const remaining = endsAt ? Math.max(0, endsAt - now) : 0;
    const secs = Math.ceil(remaining / 1000);
    const tpct = slide.timeLimit ? Math.min(100, (remaining / (slide.timeLimit * 1000)) * 100) : 0;
    const low = tpct <= 25;
    const qTimer = (
      <>
        {pracBanner}
        {warn && <div className="cheat-warn">{warn}</div>}
        {endsAt ? (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 6, background: "var(--surface-2)", zIndex: 50 }}>
            <div style={{ height: "100%", width: `${tpct}%`, background: low ? "var(--danger)" : "var(--primary)", transition: "width .3s linear" }} />
            <div style={{ position: "absolute", top: 10, right: 14, fontWeight: 800, fontSize: 18, color: low ? "var(--danger)" : "var(--ink)" }}>{secs}s</div>
          </div>
        ) : null}
      </>
    );

    // Variantli (bitta yoki ko'p)
    if (slide.options && ["SINGLE", "TRUE_FALSE", "POLL", "MULTIPLE"].includes(t ?? "")) {
      const multi = t === "MULTIPLE";
      return (
        <div className="present-stage">
          {qTimer}
          <h2 className="q-text">{slide.text}</h2>
          {slide.imageUrl && (
            <div className="center">
              <img src={slide.imageUrl} alt="" style={{ maxHeight: 220, borderRadius: 12 }} />
            </div>
          )}
          <div className="answers-grid">
            {slide.options.map((o, i) => (
              <button
                key={o.id}
                className={`answer-card ${o.imageUrl ? "has-img" : ""} ${selected.includes(o.id) ? "selected" : ""}`}
                onClick={() =>
                  multi
                    ? setSelected((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))
                    : submit(o.id)
                }
              >
                <span className={`opt-letter c-${i % 4}`}>{String.fromCharCode(65 + i)}</span>
                {o.imageUrl && <img className="opt-img" src={o.imageUrl} alt="" />}
                {o.text && <span>{o.text}</span>}
              </button>
            ))}
          </div>
          {multi && (
            <>
              <div className="spacer" />
              <button className="btn btn-lg btn-block" disabled={selected.length === 0} onClick={() => submit(selected)}>
                Tasdiqlash
              </button>
            </>
          )}
        </div>
      );
    }

    // Dropdown
    if (t === "DROPDOWN" && slide.options) {
      return (
        <div className="present-stage">
          {qTimer}
          <h2 className="q-text">{slide.text}</h2>
          <select value={selected[0] ?? ""} onChange={(e) => setSelected([e.target.value])}>
            <option value="">— tanlang —</option>
            {slide.options.map((o) => (
              <option key={o.id} value={o.id}>{o.text}</option>
            ))}
          </select>
          <button className="btn btn-lg btn-block" disabled={!selected[0]} onClick={() => submit(selected[0])}>
            Yuborish
          </button>
        </div>
      );
    }

    // Ochiq javob
    if (t === "OPEN")
      return (
        <div className="present-stage">
          {qTimer}
          <h2 className="q-text">{slide.text}</h2>
          <input value={openText} onChange={(e) => setOpenText(e.target.value)} placeholder="Javobingiz" />
          <button className="btn btn-lg btn-block" disabled={!openText.trim()} onClick={() => submit(openText.trim())}>
            Yuborish
          </button>
        </div>
      );

    // Bo'sh joyni to'ldirish
    if (t === "FILL_BLANK")
      return (
        <div className="present-stage">
          {qTimer}
          <h2 className="q-text">{slide.text}</h2>
          {fillVals.map((v, i) => (
            <div key={i}>
              <label>Bo'sh joy #{i + 1}</label>
              <input value={v} onChange={(e) => setFillVals((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))} />
            </div>
          ))}
          <button
            className="btn btn-lg btn-block"
            disabled={fillVals.some((v) => !v.trim())}
            onClick={() => submit(fillVals)}
          >
            Yuborish
          </button>
        </div>
      );

    // Juftlash
    if (t === "MATCH" && slide.lefts && slide.rights)
      return (
        <div className="present-stage">
          {qTimer}
          <h2 className="q-text">{slide.text}</h2>
          {slide.lefts.map((l) => (
            <div className="row" key={l.id} style={{ marginBottom: 8 }}>
              <strong style={{ minWidth: 120 }}>{l.text}</strong>
              <select
                value={matchMap[l.id] ?? ""}
                onChange={(e) => setMatchMap((m) => ({ ...m, [l.id]: e.target.value }))}
                style={{ marginBottom: 0 }}
              >
                <option value="">— tanlang —</option>
                {slide.rights!.map((r) => (
                  <option key={r.id} value={r.id}>{r.text}</option>
                ))}
              </select>
            </div>
          ))}
          <button
            className="btn btn-lg btn-block"
            disabled={slide.lefts.some((l) => !matchMap[l.id])}
            onClick={() => submit(matchMap)}
          >
            Yuborish
          </button>
        </div>
      );

    // Tartiblash
    if (t === "REORDER")
      return (
        <div className="present-stage">
          {qTimer}
          <h2 className="q-text">{slide.text}</h2>
          {reorder.map((it, i) => (
            <div className="row" key={it.id} style={{ marginBottom: 8 }}>
              <span className="badge">{i + 1}</span>
              <span style={{ flex: 1 }}>{it.text}</span>
              <button className="btn btn-ghost" onClick={() => setReorder((a) => swap(a, i, i - 1))}>▲</button>
              <button className="btn btn-ghost" onClick={() => setReorder((a) => swap(a, i, i + 1))}>▼</button>
            </div>
          ))}
          <button className="btn btn-lg btn-block" onClick={() => submit(reorder.map((x) => x.id))}>
            Yuborish
          </button>
        </div>
      );

    return <div className="center-screen">…</div>;
  }

  if (phase === "answered")
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          {slide?.type === "POLL" ? (
            <>
              <h1>🗳️ Qabul qilindi</h1>
              <p className="muted">Ovozingiz hisobga olindi</p>
            </>
          ) : result ? (
            result.correct ? (
              <>
                <h1>✅ To'g'ri!</h1>
                {result.points > 0 && <p style={{ fontSize: 24 }}>+{result.points} ball</p>}
                <p style={{ fontSize: 18 }}>
                  Umumiy ball: <strong>{result.score}</strong>
                </p>
              </>
            ) : (
              <>
                <h1>❌ Xato</h1>
                <p className="muted">Keyingisida omad!</p>
                <p style={{ fontSize: 18 }}>
                  Umumiy ball: <strong>{result.score}</strong>
                </p>
              </>
            )
          ) : (
            <h2>⏳ Javob qabul qilindi</h2>
          )}
          <p className="muted" style={{ marginTop: 8 }}>Keyingi savolni kuting…</p>
          {/* Kutish zerikarli bo'lmasin — qiziqarli fakt (har 8 soniyada almashadi) */}
          {fact && (
            <div style={{
              marginTop: 14, padding: "10px 14px", borderRadius: 12, textAlign: "left",
              background: "var(--surface-high, rgba(0,0,0,0.05))", fontSize: 14.5, lineHeight: 1.5,
            }}>
              💡 <strong>Bilasanmi?</strong> {fact}
            </div>
          )}
        </div>
      </div>
    );

  if (phase === "reveal") {
    const me = results?.leaderboard.find((b) => b.nickname === nickname);
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          {result ? (
            result.correct ? (
              <>
                <h1>✅ To'g'ri!</h1>
                {result.points > 0 && <p style={{ fontSize: 22 }}>+{result.points} ball</p>}
              </>
            ) : (
              <>
                <h1>❌ Xato</h1>
                {results?.correctText && <p className="muted">To'g'ri: {results.correctText}</p>}
              </>
            )
          ) : (
            <h2>Vaqt tugadi</h2>
          )}
          <p style={{ fontSize: 18 }}>Umumiy ball: <strong>{me?.score ?? result?.score ?? 0}</strong></p>
        </div>
      </div>
    );
  }

  if (phase === "ended") {
    // TEST rejimida o'quvchiga faqat o'z natijasi (reyting/o'rin yo'q — faqat ustozda)
    if (gameMode === "TEST") {
      const me = results?.leaderboard.find((b) => b.nickname === nickname) as
        | (LeaderRow & { correct?: number; total?: number })
        | undefined;
      return (
        <div className="center-screen">
          <div className="card card-narrow center">
            <h1 style={{ marginTop: 0 }}>🏁 Test yakunlandi!</h1>
            {error && <div className="error">{error}</div>}
            <div className="test-score-big">{me?.score ?? 0}<span>/100</span></div>
            {me?.total != null && (
              <p style={{ fontSize: 18 }}>To'g'ri javoblar: <strong>{me.correct ?? 0}</strong> / {me.total}</p>
            )}
            <p className="muted" style={{ marginTop: 8 }}>Natijangiz o'qituvchiga yuborildi.</p>
          </div>
        </div>
      );
    }
    const place = (results?.leaderboard.findIndex((b) => b.nickname === nickname) ?? -1) + 1;
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          <h1>🏁 Tugadi!</h1>
          {error && <div className="error">{error}</div>}
          {place > 0 && <p style={{ fontSize: 22 }}>Sizning o'rningiz: <strong>{place}</strong></p>}
          <ol className="leaderboard">
            {(results?.leaderboard ?? []).slice(0, 5).map((r, i) => (
              <li key={i}><span>{i + 1}. {r.nickname}</span><span>{r.score}</span></li>
            ))}
          </ol>
        </div>
      </div>
    );
  }

  return null;
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}
