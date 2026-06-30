import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { getSocket } from "../socket";
import { getToken } from "../api";
import type { LeaderRow, SlideData } from "../types";
import SlideScene from "../components/SlideScene";
import { unlockAudio, startMusic, stopMusic, playTick, playTimeUp } from "../sound";

type Phase = "connecting" | "lobby" | "active" | "reveal" | "ended";

interface PublicSlide {
  id: string;
  index: number;
  total: number;
  kind: string;
  type: string | null;
  timeLimit: number;
  endsAt?: number;
  content?: SlideData;
  text?: string;
  imageUrl?: string;
  options?: { id: string; text: string; imageUrl?: string }[];
  blanksCount?: number;
  lefts?: { id: string; text: string }[];
  rights?: { id: string; text: string }[];
  items?: { id: string; text: string }[];
}
interface AnswerLists {
  correct: string[];
  wrong: string[];
  noAnswer: string[];
}
interface Results {
  correctOptionIds?: string[];
  correctText?: string;
  voteCounts?: Record<string, number>;
  poll?: boolean;
  leaderboard: LeaderRow[];
  answers?: AnswerLists;
}
interface GameSettings {
  questionTimer: boolean;
  anonymous: boolean;
  serious: boolean;
  antiCheat: boolean;
  disableRightClick: boolean;
}
interface PlayerRow {
  id: string;
  nickname: string;
}
interface TestProgRow {
  id: string;
  nickname: string;
  answered: number;
  score: number;
  correct: number;
  finished: boolean;
  flags: number;
  connected: boolean;
}

const initial = (s: string) => (s?.[0] ?? "?").toUpperCase();

export default function Host() {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const created = useRef(false);

  const [phase, setPhase] = useState<Phase>("connecting");
  const [pin, setPin] = useState("");
  const [title, setTitle] = useState("");
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [slide, setSlide] = useState<PublicSlide | null>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 0 });
  const [answeredNames, setAnsweredNames] = useState<string[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState("");

  // taymer
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  // overlaylar
  const [showWheel, setShowWheel] = useState(false);
  const [showBoard, setShowBoard] = useState(false);
  const [showNames, setShowNames] = useState(true);

  // ovoz/musiqa (host ekranida sinf uchun chalinadi)
  const [soundOn, setSoundOn] = useState(true);

  // amaliyot (mashq) taymeri
  const [practiceEndsAt, setPracticeEndsAt] = useState(0);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // ovoz/avto-reyting yordamchi ref'lari (qayta chalinmaslik uchun)
  const lbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTick = useRef(0); // savol taymeri: oxirgi tiklangan soniya
  const endPlayed = useRef(false); // savol taymeri: tugash ovozi chalindimi
  const lastPracTick = useRef(0); // amaliyot taymeri: oxirgi tik soniya
  const pracEndPlayed = useRef(false); // amaliyot taymeri: tugash ovozi

  // start oldidan sozlamalar
  const [settings, setSettings] = useState<GameSettings>({
    questionTimer: true,
    anonymous: false,
    serious: false,
    antiCheat: false,
    disableRightClick: false,
  });
  // anti-cheat ogohlantirishlari (nickname -> soni)
  const [flags, setFlags] = useState<Record<string, number>>({});

  // rejim: jonli (host boshqaradi) yoki test (mustaqil)
  const [mode, setMode] = useState<"LIVE" | "TEST">("LIVE");
  const [testProg, setTestProg] = useState<{ total: number; players: TestProgRow[] }>({ total: 0, players: [] });

  // Yo'qlama eslatmalari
  const ADMIN_SIGNIN = "https://admin.robbit.uz/signin";
  const [reminder1, setReminder1] = useState(false); // boshlashdan oldin: rasm + davomat
  const [reminder2, setReminder2] = useState(false); // darsni boshlaganda: davomat saqlandimi
  const [reminder3, setReminder3] = useState(false); // 40 daqiqadan keyin: ota-onalarga video
  const reminder3Timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function createGame() {
    const socket = getSocket();
    const key = `host:${quizId}`;
    socket.emit("host:create", { token: getToken(), quizId }, (r: any) => {
      if (r.error) return setError(r.error);
      localStorage.setItem(key, r.pin);
      setPin(r.pin ?? "");
      setTitle(r.title ?? "");
      if (r.settings) setSettings(r.settings);
      setPhase("lobby");
    });
  }

  // 1-eslatma tasdiqlangach: davom etayotgan o'yin bo'lsa tiklaymiz, aks holda yangisini yaratamiz
  function beginSession() {
    const socket = getSocket();
    const key = `host:${quizId}`;
    const savedPin = localStorage.getItem(key);
    if (!savedPin) { createGame(); return; }
    socket.emit("host:resume", { pin: savedPin, token: getToken() }, (r: any) => {
      if (r.error) { localStorage.removeItem(key); createGame(); return; }
      setPin(r.pin ?? "");
      setTitle(r.title ?? "");
      if (r.settings) setSettings(r.settings);
      if (r.mode) setMode(r.mode);
      if (r.players) setPlayers(r.players as PlayerRow[]);
      if (r.practiceEndsAt) setPracticeEndsAt(r.practiceEndsAt); // amaliyot taymeri davom etsa, tiklaymiz
      if (r.status === "ended") setPhase("ended");
      else if (r.mode === "TEST" && r.status === "active") setPhase("active");
      else if ((r.status === "active" || r.status === "reveal") && r.slide) {
        setSlide(r.slide);
        setEndsAt(r.slide.endsAt ?? 0);
        setPhase(r.status === "reveal" ? "reveal" : "active");
      } else setPhase("lobby");
    });
  }

  useEffect(() => {
    const socket = getSocket();
    if (!created.current) {
      created.current = true;
      // Har safar boshlashda avval 1-eslatma chiqadi; o'yin shundan keyin yaratiladi/davom ettiriladi
      setReminder1(true);
    }
    const onLobby = (d: { players: PlayerRow[] }) => setPlayers(d.players);
    const onSlide = (s: PublicSlide) => {
      setSlide(s);
      setResults(null);
      setProgress({ answered: 0, total: 0 });
      setAnsweredNames([]);
      setEndsAt(s.endsAt ?? 0);
      setShowBoard(false);
      setPracticeEndsAt(0); // yangi slaydda amaliyot taymeri ham tugaydi
      if (lbTimer.current) { clearTimeout(lbTimer.current); lbTimer.current = null; }
      lastTick.current = 0;
      endPlayed.current = false;
      setPhase("active");
    };
    const onProgress = (d: { answered: number; total: number; answeredNames?: string[] }) => {
      setProgress({ answered: d.answered, total: d.total });
      if (d.answeredNames) setAnsweredNames(d.answeredNames);
    };
    const onTimer = (d: { endsAt: number }) => setEndsAt(d.endsAt);
    const onResults = (d: Results) => {
      setResults(d);
      setEndsAt(0);
      setPhase("reveal");
      stopMusic();
      // Har bir savoldan keyin reyting 5 soniyaga ko'rinadi
      if (lbTimer.current) clearTimeout(lbTimer.current);
      setShowBoard(true);
      lbTimer.current = setTimeout(() => setShowBoard(false), 5000);
    };
    const onPractice = (d: { endsAt: number }) => {
      setPracticeEndsAt(d.endsAt || 0);
      lastPracTick.current = 0;
      pracEndPlayed.current = false;
    };
    const onEnded = (d: { leaderboard: LeaderRow[] }) => {
      setResults({ leaderboard: d.leaderboard });
      setEndsAt(0);
      setPhase("ended");
      stopMusic();
      localStorage.removeItem(`host:${quizId}`);
    };
    const onFlag = (d: { nickname: string; count: number }) =>
      setFlags((f) => ({ ...f, [d.nickname]: d.count }));
    const onTestProg = (d: { total: number; players: TestProgRow[] }) => {
      setTestProg(d);
      setMode("TEST");
      setPhase((p) => (p === "lobby" || p === "connecting" ? "active" : p));
    };
    socket.on("test:progress", onTestProg);
    socket.on("lobby:update", onLobby);
    socket.on("slide:show", onSlide);
    socket.on("question:progress", onProgress);
    socket.on("timer:update", onTimer);
    socket.on("slide:results", onResults);
    socket.on("game:ended", onEnded);
    socket.on("host:flag", onFlag);
    socket.on("practice:timer", onPractice);
    return () => {
      socket.off("lobby:update", onLobby);
      socket.off("slide:show", onSlide);
      socket.off("question:progress", onProgress);
      socket.off("timer:update", onTimer);
      socket.off("slide:results", onResults);
      socket.off("game:ended", onEnded);
      socket.off("host:flag", onFlag);
      socket.off("test:progress", onTestProg);
      socket.off("practice:timer", onPractice);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  // taymer tiki
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // 40-daqiqalik eslatma taymerini tozalash
  useEffect(() => () => { if (reminder3Timer.current) clearTimeout(reminder3Timer.current); }, []);

  // Klaviatura strelkalari bilan slaydlarni boshqarish (jonli rejim):
  //   → keyingi slayd, ← oldingi slayd. Matn maydonida yozayotganda ishlamaydi.
  useEffect(() => {
    if (mode !== "LIVE" || (phase !== "active" && phase !== "reveal")) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); getSocket().emit("host:next", { pin }); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); getSocket().emit("host:prev", { pin }); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, phase, pin]);

  // Komponent yopilganda taymerlarni tozalash
  useEffect(() => () => { if (lbTimer.current) clearTimeout(lbTimer.current); stopMusic(); }, []);

  // Musobaqa fon musiqasi — faqat jonli savol faol bo'lganda (jiddiy rejimda emas)
  useEffect(() => {
    const isQuestion = mode === "LIVE" && phase === "active" && slide != null && slide.kind !== "CONTENT";
    if (isQuestion && soundOn && !settings.serious) startMusic();
    else stopMusic();
  }, [mode, phase, slide, soundOn, settings.serious]);

  // Savol taymeri ovozi: oxirgi 5 soniyada tik, tugaganda signal
  useEffect(() => {
    if (!soundOn || phase !== "active" || !endsAt) return;
    const rem = endsAt - now;
    if (rem <= 0) {
      if (!endPlayed.current) { endPlayed.current = true; playTimeUp(); }
      return;
    }
    const sec = Math.ceil(rem / 1000);
    if (sec <= 5 && sec !== lastTick.current) {
      lastTick.current = sec;
      playTick();
    }
  }, [now, endsAt, phase, soundOn]);

  const socket = getSocket();
  const remaining = endsAt ? Math.max(0, endsAt - now) : 0;
  const secs = Math.ceil(remaining / 1000);
  const pct = slide?.timeLimit ? Math.min(100, (remaining / (slide.timeLimit * 1000)) * 100) : 0;

  // Amaliyot (mashq) taymeri qoldig'i + tugash ovozi
  const pracRemaining = practiceEndsAt ? Math.max(0, practiceEndsAt - now) : 0;
  const pracSecs = Math.ceil(pracRemaining / 1000);
  useEffect(() => {
    if (!practiceEndsAt) return;
    const rem = practiceEndsAt - now;
    if (rem <= 0) {
      if (!pracEndPlayed.current) { pracEndPlayed.current = true; if (soundOn) playTimeUp(); setPracticeEndsAt(0); }
      return;
    }
    const sec = Math.ceil(rem / 1000);
    if (soundOn && sec <= 5 && sec !== lastPracTick.current) {
      lastPracTick.current = sec;
      playTick();
    }
  }, [now, practiceEndsAt, soundOn]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      socket.emit("host:fullscreen", { pin });
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  function endPresentation() {
    socket.emit("host:end", { pin });
  }

  // O'quvchini o'yindan chiqarish (kick)
  function kickPlayer(playerId: string, name: string) {
    if (!window.confirm(`"${name}" o'yindan chiqarilsinmi?`)) return;
    socket.emit("host:kick", { pin, playerId });
  }

  // Amaliyot taymerini boshlash (sekundlarda) — o'quvchilarga vazifa uchun vaqt
  function startPractice(seconds: number) {
    unlockAudio();
    setShowTimePicker(false);
    socket.emit("host:practiceTimer", { pin, seconds });
  }
  function stopPractice() {
    socket.emit("host:practiceStop", { pin });
  }

  function startGame() {
    unlockAudio();
    socket.emit("host:start", { pin, mode });
    if (mode === "TEST") setPhase("active"); // test'da slide:show kelmaydi
    // 3-eslatma: 40 daqiqadan keyin ota-onalar guruhiga video eslatmasi
    if (!reminder3Timer.current) {
      reminder3Timer.current = setTimeout(() => setReminder3(true), 40 * 60 * 1000);
    }
  }

  // 2-eslatma: darsni boshlashdan oldin "davomatni saqladingizmi?"
  function askStart() { setReminder2(true); }
  function confirmStart() { setReminder2(false); startGame(); }

  function updateSetting(patch: Partial<GameSettings>) {
    setSettings((s) => ({ ...s, ...patch }));
    socket.emit("host:settings", { pin, settings: patch });
  }

  // anonim rejimda ismni yashirish
  const dispName = (name: string, i: number) => (settings.anonymous ? `O'quvchi ${i + 1}` : name);
  const totalFlags = Object.values(flags).reduce((a, b) => a + b, 0);

  if (error)
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          <div className="error">{error}</div>
          <button className="btn" onClick={() => navigate("/dashboard")}>Panelga qaytish</button>
        </div>
      </div>
    );

  // 1-eslatma: boshlashdan oldin — rasm + davomat tekshiruvi (o'yin shundan keyin yaratiladi)
  if (reminder1)
    return (
      <ReminderModal
        icon="photo_camera"
        title="Yo'qlama tekshiruvi"
        message="ERP tizimida rasmga tushdingizmi va davomat qildingizmi?"
        confirmLabel="Ha"
        cancelLabel="Yo'q"
        onConfirm={() => { unlockAudio(); setReminder1(false); beginSession(); }}
        onCancel={() => { window.open(ADMIN_SIGNIN, "_blank", "noopener"); }}
      />
    );

  if (phase === "connecting") return <div className="center-screen">Ulanmoqda…</div>;

  // ====================== LOBBY ======================
  if (phase === "lobby") {
    const joinUrl = `${window.location.origin}/join?pin=${pin}`;
    return (
      <div className="lobby-screen">
        <div className="lobby-head">
          <div className="lobby-title">
            <span className="material-symbols-outlined" style={{ color: "var(--primary)" }}>rocket_launch</span>
            {title}
          </div>
          <button className="btn btn-lg" disabled={players.length === 0} onClick={askStart}>
            <span className="material-symbols-outlined">play_arrow</span>
            {mode === "TEST" ? "Testni boshlash" : "Boshlash"}
          </button>
        </div>

        <div className="lobby-body">
          <div className="join-card">
            <div className="join-step">1 — Saytga kiring</div>
            <div className="join-url">{window.location.host}/join</div>
            <div className="join-step">2 — Kodni kiriting</div>
            <div className="join-code">{pin}</div>
            <div className="qr-wrap"><QrImage text={joinUrl} size={150} /></div>
            <span className="muted" style={{ fontSize: 13 }}>QR kodni skanerlang yoki kodni kiriting</span>
          </div>

          <div className="lobby-right">
            <div className="players-head">
              <div className="players-count">
                <span className="material-symbols-outlined">group</span>
                {players.length} o'quvchi
              </div>
            </div>
            <div className="players-grid">
              {players.length === 0 ? (
                <div className="players-empty">O'quvchilar qo'shilishini kutmoqda…</div>
              ) : (
                players.map((p, i) => (
                  <span className="player-pill" key={p.id}>
                    <span className="pp-ava">{initial(dispName(p.nickname, i))}</span>
                    {dispName(p.nickname, i)}
                    <button
                      className="kick-btn"
                      title="O'yindan chiqarish"
                      onClick={() => kickPlayer(p.id, dispName(p.nickname, i))}
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </span>
                ))
              )}
            </div>

            <div className="settings-card">
              <div className="settings-title">
                <span className="material-symbols-outlined">tune</span> Sozlamalar
              </div>

              <div className="mode-switch">
                <button
                  className={`mode-opt ${mode === "LIVE" ? "active" : ""}`}
                  onClick={() => setMode("LIVE")}
                >
                  <span className="material-symbols-outlined">co_present</span>
                  <div>
                    <div className="mode-name">Jonli (Live)</div>
                    <div className="mode-desc">Ustoz boshqaradi, hamma birga</div>
                  </div>
                </button>
                <button
                  className={`mode-opt ${mode === "TEST" ? "active" : ""}`}
                  onClick={() => setMode("TEST")}
                >
                  <span className="material-symbols-outlined">quiz</span>
                  <div>
                    <div className="mode-name">Test (mustaqil)</div>
                    <div className="mode-desc">Har kim o'zi yechadi, 100 ballik</div>
                  </div>
                </button>
              </div>

              {mode === "LIVE" && (
              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-name">Savol taymeri</div>
                  <div className="setting-desc">O'chirilsa, javob vaqti cheklanmaydi</div>
                </div>
                <select
                  className="setting-select"
                  value={settings.questionTimer ? "on" : "off"}
                  onChange={(e) => updateSetting({ questionTimer: e.target.value === "on" })}
                >
                  <option value="on">Yoqilgan</option>
                  <option value="off">O'chirilgan</option>
                </select>
              </div>
              )}

              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-name">Musiqa va ovoz</div>
                  <div className="setting-desc">Quiz vaqtida musobaqa musiqasi va taymer signali</div>
                </div>
                <Toggle on={soundOn} onChange={(v) => { setSoundOn(v); if (!v) stopMusic(); else unlockAudio(); }} />
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-name">Ismlarni yashirish</div>
                  <div className="setting-desc">Ekranda ismlar o'rniga "O'quvchi N"</div>
                </div>
                <Toggle on={settings.anonymous} onChange={(v) => updateSetting({ anonymous: v })} />
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-name">Jiddiy rejim</div>
                  <div className="setting-desc">Gamifikatsiyasiz, diqqatni jamlovchi muhit</div>
                </div>
                <Toggle on={settings.serious} onChange={(v) => updateSetting({ serious: v })} />
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-name">Anti-cheat monitor</div>
                  <div className="setting-desc">Fullscreen'dan chiqish va boshqa tabga o'tishni kuzatadi</div>
                </div>
                <Toggle on={settings.antiCheat} onChange={(v) => updateSetting({ antiCheat: v })} />
              </div>

              <div className="setting-row">
                <div className="setting-info">
                  <div className="setting-name">O'ng tugmani o'chirish</div>
                  <div className="setting-desc">O'quvchida kontekst menyusi bloklanadi</div>
                </div>
                <Toggle on={settings.disableRightClick} onChange={(v) => updateSetting({ disableRightClick: v })} />
              </div>
            </div>
          </div>
        </div>

        <div className="start-bar">
          <button
            className="btn btn-lg"
            style={{ minWidth: 240 }}
            disabled={players.length === 0}
            onClick={askStart}
          >
            <span className="material-symbols-outlined">play_arrow</span>
            {mode === "TEST" ? "Testni boshlash" : "Darsni boshlash"}
          </button>
        </div>

        {reminder2 && (
          <ReminderModal
            icon="fact_check"
            title="Davomatni tekshiring"
            message="Davomatni saqladingizmi?"
            confirmLabel="Ha"
            cancelLabel="Yo'q"
            onConfirm={confirmStart}
            onCancel={() => { window.open(ADMIN_SIGNIN, "_blank", "noopener"); }}
          />
        )}
      </div>
    );
  }

  // ====================== TEST MONITOR (mustaqil rejim) ======================
  if (phase === "active" && mode === "TEST") {
    const rows = [...testProg.players].sort((a, b) => b.score - a.score || b.answered - a.answered);
    const finishedCount = testProg.players.filter((p) => p.finished).length;
    return (
      <div className="live-wrap">
        <div className="live-top">
          <div className="lt-code">Kod: <strong>{pin}</strong></div>
          <div className="lt-title">{title} · Test rejimi</div>
          <div className="row">
            <button className="tool-btn danger" onClick={endPresentation}>
              <span className="material-symbols-outlined">stop_circle</span> Testni yakunlash
            </button>
          </div>
        </div>

        <div className="test-monitor">
          <div className="tm-stats">
            <div className="tm-stat"><div className="tm-num">{testProg.players.length}</div><div className="tm-lbl">o'quvchi</div></div>
            <div className="tm-stat"><div className="tm-num">{finishedCount}</div><div className="tm-lbl">tugatdi</div></div>
            <div className="tm-stat"><div className="tm-num">{testProg.total}</div><div className="tm-lbl">savol</div></div>
          </div>

          <div className="tm-table">
            <div className="tm-row tm-head">
              <span>#</span><span>Ism</span><span>Jarayon</span><span>To'g'ri</span><span>Ball</span>
            </div>
            {rows.length === 0 && <div className="muted" style={{ padding: 16 }}>O'quvchilar testni boshlamoqda…</div>}
            {rows.map((p, i) => {
              const name = settings.anonymous ? `O'quvchi ${i + 1}` : p.nickname;
              const prog = testProg.total ? Math.round((p.answered / testProg.total) * 100) : 0;
              const fl = flags[p.nickname] ?? 0;
              return (
                <div className={`tm-row ${p.finished ? "fin" : ""}`} key={i}>
                  <span className="tm-rank">{i + 1}</span>
                  <span className="tm-name">
                    <span className="pp-ava">{(name[0] ?? "?").toUpperCase()}</span>
                    {name}
                    {!p.connected && <span className="muted" style={{ fontSize: 12 }}> (chiqdi)</span>}
                    {settings.antiCheat && fl > 0 && (
                      <span className="cheat-flag"><span className="material-symbols-outlined">warning</span>{fl}</span>
                    )}
                    <button
                      className="kick-btn"
                      style={{ marginLeft: 8 }}
                      title="O'yindan chiqarish"
                      onClick={() => kickPlayer(p.id, name)}
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </span>
                  <span className="tm-prog">
                    <span className="tm-bar"><span style={{ width: `${prog}%` }} /></span>
                    <span className="tm-prog-txt">{p.answered}/{testProg.total}</span>
                  </span>
                  <span>{p.correct}</span>
                  <span className="tm-score">{p.finished ? <strong>{p.score}</strong> : <span className="muted">{p.score}</span>}</span>
                </div>
              );
            })}
          </div>
        </div>

        {reminder3 && (
          <ReminderModal
            icon="videocam"
            title="Eslatma"
            message="Ota-onalar guruhiga video jo'natib qo'ying."
            confirmLabel="OK"
            onConfirm={() => setReminder3(false)}
          />
        )}
      </div>
    );
  }

  // ====================== ACTIVE / REVEAL ======================
  if ((phase === "active" || phase === "reveal") && slide) {
    const isContent = slide.kind === "CONTENT";
    const last = slide.index + 1 >= slide.total;
    const isPoll = slide.type === "POLL";
    const ans = phase === "reveal" ? results?.answers : undefined; // kim to'g'ri/xato belgilagani

    return (
      <div className="live-wrap">
        <div className="live-top">
          <div className="lt-code">Kod: <strong>{pin}</strong></div>
          <div className="lt-title">{title}</div>
          <div className="row">
            <button className="tool-btn" onClick={toggleFullscreen} title="To'liq ekran">
              <span className="material-symbols-outlined">fullscreen</span>
            </button>
            <button className="tool-btn danger" onClick={endPresentation}>
              <span className="material-symbols-outlined">stop_circle</span> Yakunlash
            </button>
          </div>
        </div>

        <div className={`live-main ${isContent ? "no-side" : ""}`}>
          <div className="live-content">
            {isContent ? (
              <SlideScene data={slide.content ?? {}} />
            ) : (
              <>
                <div className="live-qcard">
                  <h2 className="live-qtext">{slide.text}</h2>
                  {slide.imageUrl && <img className="live-qimg" src={slide.imageUrl} alt="" />}
                </div>
                <HostAnswers slide={slide} results={phase === "reveal" ? results : null} />
              </>
            )}
          </div>

          {!isContent && (
            <aside className="live-side">
              {phase === "active" ? (
                <div className="side-card timer-card">
                  <div className={`timer-ring ${pct <= 25 ? "low" : ""}`} style={{ ["--pct" as any]: pct }}>
                    <div className="tr-inner">{secs}</div>
                  </div>
                  <div className="timer-controls">
                    <button className="tc-btn" onClick={() => socket.emit("host:addTime", { pin, seconds: -10 })}>−10s</button>
                    <button className="tc-btn" onClick={() => socket.emit("host:addTime", { pin, seconds: 15 })}>+15s</button>
                  </div>
                  <button className="tc-btn danger" style={{ width: "100%" }} onClick={() => socket.emit("host:endTimer", { pin })}>
                    Vaqtni tugatish
                  </button>
                </div>
              ) : (
                <div className="side-card answered-stat">
                  <div className="as-num">✓</div>
                  <div className="as-lbl">Natijalar ochildi</div>
                </div>
              )}

              <div className="side-card answered-stat">
                <div className="as-num">{progress.answered}/{players.length}</div>
                <div className="as-lbl">javob berdi</div>
              </div>

              <div className="side-card">
                <div className="names-toggle">
                  <span>
                    Ishtirokchilar
                    {settings.antiCheat && totalFlags > 0 && (
                      <span className="cheat-badge" title="Anti-cheat ogohlantirishlari">
                        <span className="material-symbols-outlined">warning</span>
                        {totalFlags}
                      </span>
                    )}
                  </span>
                  {!settings.anonymous && (
                    <button
                      className="tc-btn"
                      style={{ padding: "4px 10px" }}
                      onClick={() => setShowNames((v) => !v)}
                    >
                      {showNames ? "Yashirish" : "Ko'rsatish"}
                    </button>
                  )}
                </div>
                {phase === "reveal" && ans && (
                  <div className="ans-summary">
                    <span className="ans-chip ans-correct"><span className="material-symbols-outlined">check_circle</span>{ans.correct.length} to'g'ri</span>
                    <span className="ans-chip ans-wrong"><span className="material-symbols-outlined">cancel</span>{ans.wrong.length} xato</span>
                  </div>
                )}
                <div className="attendee-list">
                  {players.length === 0 && <span className="muted" style={{ fontSize: 13 }}>O'quvchi yo'q</span>}
                  {players.map((p, i) => {
                    const done = answeredNames.includes(p.nickname);
                    const name = showNames && !settings.anonymous ? p.nickname : `O'quvchi ${i + 1}`;
                    const fl = flags[p.nickname] ?? 0;
                    // Reveal vaqtida: kim to'g'ri / xato belgilagani
                    const st = phase === "reveal" && ans
                      ? ans.correct.includes(p.nickname) ? "correct" : ans.wrong.includes(p.nickname) ? "wrong" : "none"
                      : null;
                    return (
                      <div className={`attendee ${done ? "done" : ""} ${st === "correct" ? "ans-correct" : st === "wrong" ? "ans-wrong" : ""}`} key={p.id}>
                        <span className="at-dot" />
                        {name}
                        {settings.antiCheat && fl > 0 && (
                          <span className="cheat-flag" title="Ogohlantirishlar soni">
                            <span className="material-symbols-outlined">warning</span>{fl}
                          </span>
                        )}
                        {st === "correct" && <span style={{ marginLeft: "auto", color: "var(--olive)" }} className="material-symbols-outlined">check_circle</span>}
                        {st === "wrong" && <span style={{ marginLeft: "auto", color: "var(--danger, #e5484d)" }} className="material-symbols-outlined">cancel</span>}
                        {st == null && done && <span style={{ marginLeft: "auto" }} className="material-symbols-outlined">check</span>}
                        <button
                          className="kick-btn"
                          style={{ marginLeft: (st != null || done) ? 6 : "auto" }}
                          title="O'yindan chiqarish"
                          onClick={() => kickPlayer(p.id, name)}
                        >
                          <span className="material-symbols-outlined">close</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>
          )}
        </div>

        <div className="live-bottom">
          <div className="lb-left">
            {!settings.serious && (
              <button className="tool-btn" onClick={() => setShowWheel(true)} disabled={players.length === 0}>
                <span className="material-symbols-outlined">casino</span> Tasodifiy tanlash
              </button>
            )}
            {phase === "reveal" && !isContent && (
              <button className="tool-btn" onClick={() => setShowBoard(true)}>
                <span className="material-symbols-outlined">leaderboard</span> Reyting
              </button>
            )}
            {/* Amaliyot (mashq) taymeri — o'quvchilarga vazifa uchun vaqt */}
            <div className="prac-timer-wrap">
              {practiceEndsAt ? (
                <button className="tool-btn danger" onClick={stopPractice}>
                  <span className="material-symbols-outlined">timer_off</span>
                  Taymer: {Math.floor(pracSecs / 60)}:{String(pracSecs % 60).padStart(2, "0")}
                </button>
              ) : (
                <button className="tool-btn" onClick={() => setShowTimePicker((v) => !v)}>
                  <span className="material-symbols-outlined">timer</span> Vaqt berish
                </button>
              )}
              {showTimePicker && !practiceEndsAt && (
                <div className="prac-picker">
                  {[30, 60, 120, 180, 300, 600].map((s) => (
                    <button key={s} className="prac-opt" onClick={() => startPractice(s)}>
                      {s < 60 ? `${s}s` : `${s / 60} daq`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lb-center">
            <span className="material-symbols-outlined">slideshow</span>
            Slayd {slide.index + 1} / {slide.total}
          </div>

          <div className="lb-right">
            <button className="tool-btn" disabled={slide.index === 0} onClick={() => socket.emit("host:prev", { pin })}>
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            {!isContent && phase === "active" && (
              <button className="tool-btn primary" onClick={() => socket.emit("host:reveal", { pin })}>
                <span className="material-symbols-outlined">visibility</span>
                {isPoll ? "Ovozlarni ko'rsatish" : "Javobni ko'rsatish"}
              </button>
            )}
            <button className="tool-btn primary" onClick={() => socket.emit("host:next", { pin })}>
              {last ? "Yakunlash" : "Keyingi"} <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>

        {/* Amaliyot taymeri — katta sanagich (proyektorda ko'rinadi) */}
        {practiceEndsAt > 0 && (
          <div className={`prac-banner ${pracSecs <= 5 ? "low" : ""}`}>
            <span className="material-symbols-outlined">timer</span>
            <span className="prac-time">{Math.floor(pracSecs / 60)}:{String(pracSecs % 60).padStart(2, "0")}</span>
            <span className="prac-lbl">Amaliyot vaqti</span>
          </div>
        )}

        {showWheel && (
          <SpinWheel players={players.map((p, i) => dispName(p.nickname, i))} onClose={() => setShowWheel(false)} />
        )}
        {showBoard && results && (
          <LeaderboardOverlay rows={results.leaderboard} anonymous={settings.anonymous} onClose={() => setShowBoard(false)} />
        )}
        {reminder3 && (
          <ReminderModal
            icon="videocam"
            title="Eslatma"
            message="Ota-onalar guruhiga video jo'natib qo'ying."
            confirmLabel="OK"
            onConfirm={() => setReminder3(false)}
          />
        )}
      </div>
    );
  }

  // ====================== ENDED — PODIUM ======================
  if (phase === "ended")
    return (
      <Podium
        rows={results?.leaderboard ?? []}
        anonymous={settings.anonymous}
        serious={settings.serious}
        onBack={() => navigate("/dashboard")}
      />
    );

  return null;
}

/* ---------------- Javob plitkalari (host ko'rinishi) ---------------- */
function HostAnswers({ slide, results }: { slide: PublicSlide; results: Results | null }) {
  const t = slide.type;
  if (slide.options && ["SINGLE", "MULTIPLE", "TRUE_FALSE", "DROPDOWN", "POLL"].includes(t ?? "")) {
    const single = slide.options.length <= 2;
    return (
      <div className={`live-answers ${single ? "cols-1" : ""}`}>
        {slide.options.map((o, i) => {
          const isRight = results?.correctOptionIds?.includes(o.id);
          const cls = results
            ? isRight
              ? "right"
              : results.poll
                ? ""
                : "dim"
            : "";
          const votes = results?.voteCounts?.[o.id];
          return (
            <div className={`live-opt c-${i % 4} ${cls}`} key={o.id}>
              <span className="lo-letter">{String.fromCharCode(65 + i)}</span>
              {o.imageUrl && <img className="lo-img" src={o.imageUrl} alt="" />}
              {o.text && <span className="lo-text">{o.text}</span>}
              {votes != null && <span className="lo-votes">{votes}</span>}
              {isRight && <span className="lo-check material-symbols-outlined">check_circle</span>}
            </div>
          );
        })}
      </div>
    );
  }
  // OPEN / FILL_BLANK / MATCH / REORDER
  return (
    <div className="live-qcard live-textans">
      {results?.correctText ? (
        <p style={{ fontSize: 22, margin: 0 }}>
          <span className="material-symbols-outlined" style={{ color: "var(--olive)" }}>check_circle</span>{" "}
          To'g'ri javob: <strong>{results.correctText}</strong>
        </p>
      ) : (
        <p className="muted" style={{ margin: 0 }}>O'quvchilar javob bermoqda…</p>
      )}
    </div>
  );
}

/* ---------------- QR kod ---------------- */
function QrImage({ text, size }: { text: string; size: number }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    QRCode.toDataURL(text, { width: size, margin: 1 }).then(setUrl).catch(() => setUrl(""));
  }, [text, size]);
  if (!url) return <div style={{ width: size, height: size }} />;
  return <img src={url} width={size} height={size} alt="QR" style={{ display: "block", borderRadius: 6 }} />;
}

/* ---------------- Spin the wheel ---------------- */
function SpinWheel({ players, onClose }: { players: string[]; onClose: () => void }) {
  const [active, setActive] = useState(-1);
  const [winner, setWinner] = useState(-1);
  const [spinning, setSpinning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function spin() {
    if (!players.length || spinning) return;
    setWinner(-1);
    setSpinning(true);
    const target = Math.floor(Math.random() * players.length);
    const totalSteps = players.length * 4 + target + 6;
    let i = 0;
    const step = () => {
      setActive(i % players.length);
      i++;
      if (i > totalSteps) {
        setActive(target);
        setWinner(target);
        setSpinning(false);
        return;
      }
      // sekinlashish: oxiriga borgan sari kechikish ortadi
      const delay = 55 + Math.pow(i / totalSteps, 3) * 420;
      timer.current = setTimeout(step, delay);
    };
    step();
  }

  return (
    <div className="spin-overlay">
      <button className="btn btn-ghost spin-close" onClick={onClose}>✕ Yopish</button>
      <div className="spin-title">🎲 Tasodifiy o'quvchi</div>
      <div className="spin-winner-banner">{winner >= 0 ? `🎉 ${players[winner]} tanlandi!` : ""}</div>
      <div className="spin-list">
        {players.map((p, i) => (
          <div className={`spin-item ${active === i ? "active" : ""} ${winner === i ? "winner" : ""}`} key={i}>
            <span className="si-ava">{initial(p)}</span>
            {p}
          </div>
        ))}
      </div>
      <button className="spin-btn" onClick={spin} disabled={spinning || players.length === 0}>
        {spinning ? "Aylanmoqda…" : winner >= 0 ? "Qayta aylantirish" : "Aylantirish"}
      </button>
    </div>
  );
}

/* ---------------- Leaderboard overlay ---------------- */
function LeaderboardOverlay({ rows, anonymous, onClose }: { rows: LeaderRow[]; anonymous?: boolean; onClose: () => void }) {
  return (
    <div className="lbo-overlay" onClick={onClose}>
      <div className="lbo-title">🏆 Reyting</div>
      <div className="lbo-skip">Yopish uchun bosing</div>
      <div className="lbo-head">
        <span>O'rin</span>
        <span>Ism</span>
        <span style={{ textAlign: "right" }}>Ball</span>
      </div>
      {rows.slice(0, 10).map((r, i) => {
        const name = anonymous ? `O'quvchi ${i + 1}` : r.nickname;
        return (
          <div className="lbo-row" key={i} style={{ animationDelay: `${i * 0.05}s` }}>
            <span>#{i + 1}</span>
            <span className="lbo-name">
              <span className="pp-ava">{initial(name)}</span>
              {name}
              {r.lastGain > 0 && <span className="lbo-gain">+{r.lastGain}</span>}
            </span>
            <span className="lbo-score">{r.score}</span>
          </div>
        );
      })}
      {rows.length === 0 && <p style={{ color: "#fff" }}>Hali natija yo'q</p>}
    </div>
  );
}

/* ---------------- Yo'qlama eslatma modali ---------------- */
function ReminderModal({
  icon, title, message, confirmLabel, cancelLabel, onConfirm, onCancel,
}: {
  icon: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.65)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: "var(--surface)", borderRadius: 20, padding: "32px 28px",
        width: "min(440px, 100%)", textAlign: "center", boxShadow: "0 24px 70px rgba(0,0,0,0.45)",
      }}>
        <div style={{
          width: 68, height: 68, borderRadius: "50%", background: "var(--primary-soft)",
          display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px",
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 36, color: "var(--primary)" }}>{icon}</span>
        </div>
        <h2 style={{ fontSize: 22, margin: "0 0 10px" }}>{title}</h2>
        <p style={{ fontSize: 16, color: "var(--muted)", margin: "0 0 26px", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          {cancelLabel && onCancel && (
            <button className="btn btn-ghost btn-lg" style={{ minWidth: 120 }} onClick={onCancel}>{cancelLabel}</button>
          )}
          <button className="btn btn-lg" style={{ minWidth: 120 }} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Toggle (switch) ---------------- */
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`switch ${on ? "on" : ""}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
    >
      <span className="switch-knob" />
    </button>
  );
}

/* ---------------- Podium (yakuniy) ---------------- */
function Podium({
  rows,
  anonymous,
  serious,
  onBack,
}: {
  rows: LeaderRow[];
  anonymous?: boolean;
  serious?: boolean;
  onBack: () => void;
}) {
  const nm = (i: number, name: string) => (anonymous ? `O'quvchi ${i + 1}` : name);

  // Jiddiy rejim — gamifikatsiyasiz oddiy ro'yxat
  if (serious)
    return (
      <div className="podium-screen" style={{ justifyContent: "flex-start" }}>
        <div className="podium-head">
          <h1>Yakuniy natijalar</h1>
        </div>
        <ol className="leaderboard" style={{ width: "min(620px, 94%)", margin: "10px auto" }}>
          {rows.slice(0, 20).map((r, i) => (
            <li key={i}>
              <span>{i + 1}. {nm(i, r.nickname)}</span>
              <span>{r.score}</span>
            </li>
          ))}
          {rows.length === 0 && <li><span>Natija yo'q</span></li>}
        </ol>
        <div className="start-bar" style={{ width: "100%" }}>
          <button className="btn btn-lg" onClick={onBack}>Panelga qaytish</button>
        </div>
      </div>
    );

  const top = rows.slice(0, 3);
  const rest = rows.slice(3, 10);
  // ko'rsatish tartibi: 2-chi, 1-chi, 3-chi
  const order = [
    { row: top[1], idx: 1, col: "col-2", bar: "p2", label: "2nd" },
    { row: top[0], idx: 0, col: "col-1", bar: "p1", label: "1st" },
    { row: top[2], idx: 2, col: "col-3", bar: "p3", label: "3rd" },
  ].filter((x) => x.row);

  return (
    <div className="podium-screen">
      <div className="podium-head">
        <h1>🏆 Natijalar</h1>
        <p className="muted">Tabriklaymiz!</p>
      </div>

      <div className="podium-row">
        {order.map(({ row, idx, col, bar, label }) => (
          <div className={`podium-col ${col}`} key={label}>
            <div className="podium-person">
              <div className="podium-ava">{initial(nm(idx, row!.nickname))}</div>
              <div className="podium-name">{nm(idx, row!.nickname)}</div>
              <div className="podium-score">{row!.score} ball</div>
            </div>
            <div className={`podium-bar ${bar}`}>{label}</div>
          </div>
        ))}
      </div>

      {rest.length > 0 && (
        <ol className="leaderboard podium-rest">
          {rest.map((r, i) => (
            <li key={i}>
              <span>{i + 4}. {nm(i + 3, r.nickname)}</span>
              <span>{r.score}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="start-bar" style={{ width: "100%" }}>
        <button className="btn btn-lg" onClick={onBack}>Panelga qaytish</button>
      </div>
    </div>
  );
}
