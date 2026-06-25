import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getSocket } from "../socket";
import type { LeaderRow } from "../types";
import SlideCanvas from "../components/SlideCanvas";
import TestRunner from "../components/TestRunner";

type Phase = "form" | "lobby" | "content" | "question" | "answered" | "reveal" | "ended" | "test";

interface PublicSlide {
  id: string;
  index: number;
  total: number;
  kind: string;
  type: string | null;
  timeLimit?: number;
  endsAt?: number;
  content?: { title: string; body: string; imageUrl: string };
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

export default function Join() {
  const [params] = useSearchParams();
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

  // interaktiv javob holatlari
  const [selected, setSelected] = useState<string[]>([]);
  const [openText, setOpenText] = useState("");
  const [fillVals, setFillVals] = useState<string[]>([]);
  const [matchMap, setMatchMap] = useState<Record<string, string>>({});
  const [reorder, setReorder] = useState<{ id: string; text: string }[]>([]);

  useEffect(() => {
    const socket = getSocket();
    const onSlide = (s: PublicSlide) => {
      setSlide(s);
      setResult(null);
      setResults(null);
      setEndsAt(s.endsAt ?? 0);
      setPhase(s.kind === "CONTENT" ? "content" : "question");
    };
    const onReceived = (r: { correct: boolean; points: number; score: number }) => {
      setResult(r);
      setScore(r.score);
    };
    const onTimer = (d: { endsAt: number }) => setEndsAt(d.endsAt);
    const onResults = (d: Results) => {
      setResults(d);
      setEndsAt(0);
      setPhase("reveal");
    };
    const onEnded = (d: { leaderboard: LeaderRow[]; hostLeft?: boolean }) => {
      setResults({ leaderboard: d.leaderboard });
      if (d.hostLeft) setError("O'qituvchi o'yindan chiqdi");
      setPhase("ended");
      localStorage.removeItem("player");
    };
    const onFs = () => {
      document.documentElement.requestFullscreen?.().catch(() => {});
    };
    const onSettings = (s: { antiCheat: boolean; disableRightClick: boolean; serious: boolean }) => setStuSettings(s);
    const onTestBegin = () => {
      setGameMode("TEST");
      setPhase("test");
    };
    socket.on("test:begin", onTestBegin);
    socket.on("slide:show", onSlide);
    socket.on("answer:received", onReceived);
    socket.on("timer:update", onTimer);
    socket.on("slide:results", onResults);
    socket.on("game:ended", onEnded);
    socket.on("present:fullscreen", onFs);
    socket.on("game:settings", onSettings);
    return () => {
      socket.off("slide:show", onSlide);
      socket.off("answer:received", onReceived);
      socket.off("timer:update", onTimer);
      socket.off("slide:results", onResults);
      socket.off("game:ended", onEnded);
      socket.off("present:fullscreen", onFs);
      socket.off("game:settings", onSettings);
      socket.off("test:begin", onTestBegin);
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

  // taymer tiki
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Qayta ulanish — sahifa yangilansa o'yinga qaytadi
  useEffect(() => {
    const raw = localStorage.getItem("player");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { pin: string; playerId: string; nickname: string };
      setPin(saved.pin);
      setNickname(saved.nickname);
      getSocket().emit("player:rejoin", { pin: saved.pin, playerId: saved.playerId }, (r: any) => {
        if (r.error) {
          localStorage.removeItem("player");
          return;
        }
        setNickname(r.nickname ?? saved.nickname);
        if (typeof r.score === "number") setScore(r.score);
        if (r.settings) setStuSettings(r.settings);
        setPhase(r.status === "ended" ? "ended" : "lobby");
      });
    } catch {
      localStorage.removeItem("player");
    }
  }, []);

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
      (r: { ok?: boolean; playerId?: string; error?: string; settings?: typeof stuSettings }) => {
        if (r.error) {
          setError(r.error);
          return;
        }
        if (r.settings) setStuSettings(r.settings);
        localStorage.setItem("player", JSON.stringify({ pin, playerId: r.playerId, nickname }));
        setPhase("lobby");
      },
    );
  }

  function submit(answer: unknown) {
    getSocket().emit("player:answer", { pin, answer });
    setPhase("answered");
  }

  function toggleFs() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }

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
            />
            <label>Ismingiz</label>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} />
            <button className="btn btn-block" type="submit" disabled={pin.length !== 6 || !nickname.trim()}>
              Kirish
            </button>
          </form>
        </div>
      </div>
    );

  if (phase === "lobby")
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          <h2>✅ Qo'shildingiz!</h2>
          <p className="muted">Salom, {nickname}! Boshlanishini kuting…</p>
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
            <SlideCanvas
              title={slide.content?.title}
              body={slide.content?.body}
              imageUrl={slide.content?.imageUrl}
            />
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
