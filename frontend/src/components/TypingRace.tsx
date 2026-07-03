import { useEffect, useRef, useState } from "react";

// Lobby'dagi tezkor yozish musobaqasi (monkeytype uslubida, 30 soniya).
// O'quvchi so'zlarni teradi; WPM va aniqlik hisoblanadi, natija serverga yuboriladi
// va host ekranida jonli TOP-5 reyting ko'rinadi.

// Apostrofsiz sodda o'zbek so'zlari — telefonda terish oson va adolatli bo'lsin
const WORDS = [
  "robot", "kod", "dastur", "sensor", "motor", "tugma", "ekran", "internet",
  "sayt", "dron", "fazo", "yulduz", "sayyora", "quyosh", "kitob", "maktab",
  "daraxt", "olma", "anor", "bola", "katta", "kichik", "tez", "sekin",
  "yashil", "suv", "non", "gul", "mushuk", "qush", "baliq", "daryo",
  "shamol", "bulut", "osmon", "yer", "temir", "oyna", "eshik", "stol",
  "qalam", "rasm", "musiqa", "raqam", "savol", "javob", "dars", "ustoz",
];

const RACE_SECS = 30;
const WORD_COUNT = 40; // 30 soniyada yetarli zaxira

function pickWords(): string[] {
  const out: string[] = [];
  for (let i = 0; i < WORD_COUNT; i++) out.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
  return out;
}

export interface TypingRow {
  nickname: string;
  avatar: string;
  wpm: number;
  acc: number;
}

export default function TypingRace({
  board,
  myName,
  onFinish,
}: {
  board: TypingRow[];
  myName: string;
  onFinish: (wpm: number, acc: number) => void;
}) {
  const [words, setWords] = useState<string[]>(() => pickWords());
  const [wordIdx, setWordIdx] = useState(0);
  const [input, setInput] = useState("");
  const [startAt, setStartAt] = useState(0); // 0 = boshlanmagan
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<{ wpm: number; acc: number } | null>(null);
  const typedRef = useRef({ typed: 0, correct: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  // Taymer tiki
  useEffect(() => {
    if (!startAt || result) return;
    const id = setInterval(() => setNow(Date.now()), 300);
    return () => clearInterval(id);
  }, [startAt, result]);

  const elapsed = startAt ? (now - startAt) / 1000 : 0;
  const left = Math.max(0, RACE_SECS - elapsed);

  // Vaqt tugadi — poygani yakunlaymiz
  useEffect(() => {
    if (!startAt || result) return;
    if (left > 0) return;
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, startAt, result]);

  function finish() {
    const mins = Math.max((Date.now() - startAt) / 60000, 0.05);
    const { typed, correct } = typedRef.current;
    const wpm = Math.round(correct / 5 / mins);
    const acc = typed > 0 ? Math.round((correct / typed) * 100) : 0;
    setResult({ wpm, acc });
    if (wpm > 0) onFinish(wpm, acc);
  }

  function restart() {
    setWords(pickWords());
    setWordIdx(0);
    setInput("");
    setStartAt(0);
    setResult(null);
    typedRef.current = { typed: 0, correct: 0 };
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function onChange(v: string) {
    if (result) return;
    if (!startAt) setStartAt(Date.now());
    // Bo'shliq — so'z topshirildi
    if (v.endsWith(" ")) {
      const typedWord = v.trim();
      if (!typedWord) { setInput(""); return; }
      const target = words[wordIdx] ?? "";
      let ok = 0;
      for (let i = 0; i < typedWord.length; i++) if (typedWord[i] === target[i]) ok++;
      typedRef.current.typed += typedWord.length + 1;
      // To'liq to'g'ri so'z uchun bo'shliq ham "to'g'ri belgi" hisoblanadi (monkeytype kabi)
      typedRef.current.correct += ok + (typedWord === target ? 1 : 0);
      const next = wordIdx + 1;
      setWordIdx(next);
      setInput("");
      if (next >= words.length) finish();
      return;
    }
    setInput(v);
  }

  const target = words[wordIdx] ?? "";
  const secsLeft = Math.ceil(left);

  return (
    <div style={{ marginTop: 16, textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <strong style={{ fontSize: 15 }}>⌨️ Tezkor yozish</strong>
        {startAt > 0 && !result && (
          <span style={{ fontWeight: 800, color: secsLeft <= 5 ? "var(--error, #dc2626)" : "var(--primary)" }}>
            {secsLeft}s
          </span>
        )}
      </div>

      {result ? (
        <div style={{ textAlign: "center", padding: "10px 0" }}>
          <div style={{ fontSize: 34, fontWeight: 800 }}>{result.wpm} <span style={{ fontSize: 16, fontWeight: 600 }}>WPM</span></div>
          <div className="muted" style={{ fontSize: 14 }}>Aniqlik: {result.acc}%</div>
          <button className="btn" style={{ marginTop: 10 }} onClick={restart}>🔄 Qayta o'ynash</button>
        </div>
      ) : (
        <>
          {/* So'zlar lentasi: joriy so'z belgilab ko'rsatiladi, terilgan qismi rangda */}
          <div style={{
            background: "var(--surface-high, rgba(0,0,0,0.05))", borderRadius: 10, padding: "10px 12px",
            fontSize: 18, lineHeight: 1.7, minHeight: 62, fontFamily: "ui-monospace, monospace",
            whiteSpace: "nowrap", overflow: "hidden",
          }}>
            {words.slice(wordIdx, wordIdx + 6).map((w, i) => {
              if (i > 0) return <span key={wordIdx + i} className="muted"> {w}</span>;
              // Joriy so'z — har harfi holatiga qarab ranglanadi
              return (
                <span key={wordIdx} style={{ textDecoration: "underline", textUnderlineOffset: 4 }}>
                  {w.split("").map((ch, ci) => {
                    const t = input[ci];
                    const color = t == null ? undefined : t === ch ? "#16a34a" : "#dc2626";
                    return <span key={ci} style={{ color, fontWeight: t != null ? 800 : 600 }}>{ch}</span>;
                  })}
                  {input.length > w.length && <span style={{ color: "#dc2626" }}>{input.slice(w.length)}</span>}
                </span>
              );
            })}
          </div>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => onChange(e.target.value)}
            placeholder={startAt ? "" : "Yozishni boshlang — vaqt ketadi…"}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            style={{ marginTop: 8, width: "100%", fontSize: 17, fontFamily: "ui-monospace, monospace" }}
          />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            So'zni terib bo'shliq bosing · {RACE_SECS} soniya · natija: {target ? `${wordIdx} ta so'z terildi` : ""}
          </div>
        </>
      )}

      {/* Jonli reyting (TOP-5) */}
      {board.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4 }}>🏆 Eng tezkorlar</div>
          {board.slice(0, 5).map((r, i) => (
            <div key={r.nickname + i} style={{
              display: "flex", justifyContent: "space-between", padding: "3px 8px", borderRadius: 8, fontSize: 14,
              background: r.nickname === myName ? "var(--primary-soft, rgba(76,141,255,0.12))" : undefined,
              fontWeight: r.nickname === myName ? 800 : 500,
            }}>
              <span>{i + 1}. {r.avatar ? `${r.avatar} ` : ""}{r.nickname}</span>
              <span>{r.wpm} WPM</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
