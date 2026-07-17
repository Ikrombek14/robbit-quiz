import { useEffect, useRef, useState } from "react";

// Lobby'dagi tezkor yozish musobaqasi — monkeytype uslubida:
// katta matn maydoni, har harf jonli ranglanadi (to'g'ri/xato), miltillovchi kursor,
// yashirin input (maydonga bosilsa klaviatura ochiladi). 30 soniyalik poyga,
// natija (WPM + aniqlik) serverga yuboriladi, host ekranida jonli TOP-5.

// Uch tilda sodda so'zlar (apostrofsiz) — telefonda terish oson va adolatli bo'lsin.
// O'quvchi o'zi tilni tanlaydi, tanlov localStorage'da eslab qolinadi.
type Lang = "uz" | "en" | "ru";

const WORD_SETS: Record<Lang, string[]> = {
  uz: [
    "robot", "kod", "dastur", "sensor", "motor", "tugma", "ekran", "internet",
    "sayt", "dron", "fazo", "yulduz", "sayyora", "quyosh", "kitob", "maktab",
    "daraxt", "olma", "anor", "bola", "katta", "kichik", "tez", "sekin",
    "yashil", "suv", "non", "gul", "mushuk", "qush", "baliq", "daryo",
    "shamol", "bulut", "osmon", "yer", "temir", "oyna", "eshik", "stol",
    "qalam", "rasm", "musiqa", "raqam", "savol", "javob", "dars", "ustoz",
    "vaqt", "kun", "tun", "yoz", "qish", "bahor", "kuz", "rang",
  ],
  en: [
    "robot", "code", "program", "sensor", "motor", "button", "screen", "internet",
    "site", "drone", "space", "star", "planet", "sun", "book", "school",
    "tree", "apple", "child", "big", "small", "fast", "slow", "green",
    "water", "bread", "flower", "cat", "bird", "fish", "river", "wind",
    "cloud", "sky", "earth", "iron", "glass", "door", "table", "pencil",
    "picture", "music", "number", "question", "answer", "lesson", "teacher", "time",
    "day", "night", "summer", "winter", "spring", "autumn", "color", "game",
  ],
  ru: [
    "робот", "код", "программа", "сенсор", "мотор", "кнопка", "экран", "интернет",
    "сайт", "дрон", "космос", "звезда", "планета", "солнце", "книга", "школа",
    "дерево", "яблоко", "ребенок", "большой", "маленький", "быстро", "медленно", "зеленый",
    "вода", "хлеб", "цветок", "кошка", "птица", "рыба", "река", "ветер",
    "облако", "небо", "земля", "железо", "стекло", "дверь", "стол", "карандаш",
    "рисунок", "музыка", "число", "вопрос", "ответ", "урок", "учитель", "время",
    "день", "ночь", "лето", "зима", "весна", "осень", "цвет", "игра",
  ],
};

const LANG_LABELS: { key: Lang; label: string }[] = [
  { key: "uz", label: "O'zbekcha" },
  { key: "en", label: "English" },
  { key: "ru", label: "Русский" },
];

const RACE_SECS = 30;
const WORD_COUNT = 80; // 30 soniyaga bemalol yetadi

function savedLang(): Lang {
  const v = localStorage.getItem("tr_lang");
  return v === "en" || v === "ru" ? v : "uz";
}

function pickWords(lang: Lang): string[] {
  const set = WORD_SETS[lang];
  const out: string[] = [];
  for (let i = 0; i < WORD_COUNT; i++) out.push(set[Math.floor(Math.random() * set.length)]);
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
  totalBonus = 0,
  onFinish,
}: {
  board: TypingRow[];
  myName: string;
  totalBonus?: number; // serverda jamlangan bonus (o'yin boshida ballga qo'shiladi)
  onFinish: (wpm: number, acc: number) => void;
}) {
  const [lang, setLang] = useState<Lang>(savedLang);
  const [words, setWords] = useState<string[]>(() => pickWords(savedLang()));
  const [typedWords, setTypedWords] = useState<string[]>([]); // topshirilgan so'zlar (tarix rang uchun)
  const [input, setInput] = useState("");
  const [startAt, setStartAt] = useState(0); // 0 = boshlanmagan
  const [now, setNow] = useState(Date.now());
  const [focused, setFocused] = useState(false);
  const [result, setResult] = useState<{ wpm: number; acc: number } | null>(null);
  const typedRef = useRef({ typed: 0, correct: 0 });
  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const curWordRef = useRef<HTMLSpanElement>(null);

  const wordIdx = typedWords.length;

  // Taymer tiki (poyga davomida WPM ham jonli yangilanadi)
  useEffect(() => {
    if (!startAt || result) return;
    const id = setInterval(() => setNow(Date.now()), 250);
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

  // Joriy so'z doim ko'rinib tursin — matn maydonini unga suriltiramiz (monkeytype kabi)
  useEffect(() => {
    const area = areaRef.current;
    const cur = curWordRef.current;
    if (!area || !cur) return;
    const target = cur.offsetTop - area.offsetTop;
    if (Math.abs(area.scrollTop - target) > 4) area.scrollTo({ top: target, behavior: "smooth" });
  }, [wordIdx, input]);

  function finish() {
    const mins = Math.max((Date.now() - startAt) / 60000, 0.05);
    const { typed, correct } = typedRef.current;
    const wpm = Math.round(correct / 5 / mins);
    const acc = typed > 0 ? Math.round((correct / typed) * 100) : 0;
    setResult({ wpm, acc });
    if (wpm > 0) onFinish(wpm, acc);
  }

  function restart(l: Lang = lang) {
    setWords(pickWords(l));
    setTypedWords([]);
    setInput("");
    setStartAt(0);
    setResult(null);
    typedRef.current = { typed: 0, correct: 0 };
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // Til almashtirish — tanlov eslab qolinadi, poyga yangi so'zlar bilan qayta boshlanadi
  function switchLang(l: Lang) {
    if (l === lang) return;
    localStorage.setItem("tr_lang", l);
    setLang(l);
    restart(l);
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
      const next = [...typedWords, typedWord];
      setTypedWords(next);
      setInput("");
      if (next.length >= words.length) finish();
      return;
    }
    setInput(v);
  }

  // Jonli WPM (poyga davomida)
  const liveMins = Math.max(elapsed / 60, 0.03);
  const liveWpm = startAt ? Math.round(typedRef.current.correct / 5 / liveMins) : 0;
  const secsLeft = Math.ceil(left);

  // ---- Bitta so'zni harf-harf chizish ----
  function renderWord(w: string, i: number) {
    if (i < wordIdx) {
      // Topshirilgan so'z — terilgani bilan solishtirib ranglaymiz
      const t = typedWords[i] ?? "";
      const wrong = t !== w;
      return (
        <span key={i} className="tr-word" style={wrong ? { textDecoration: "underline", textDecorationColor: "var(--tr-bad)" } : undefined}>
          {w.split("").map((ch, ci) => (
            <span key={ci} style={{ color: t[ci] == null ? "var(--tr-dim)" : t[ci] === ch ? "var(--tr-ok)" : "var(--tr-bad)" }}>{ch}</span>
          ))}
          {t.length > w.length && <span style={{ color: "var(--tr-bad)" }}>{t.slice(w.length)}</span>}
        </span>
      );
    }
    if (i === wordIdx) {
      // Joriy so'z — kursor bilan
      return (
        <span key={i} ref={curWordRef} className="tr-word">
          {w.split("").map((ch, ci) => {
            const t = input[ci];
            return (
              <span key={ci} style={{ position: "relative", color: t == null ? "var(--tr-dim)" : t === ch ? "var(--tr-ok)" : "var(--tr-bad)" }}>
                {ci === input.length && <span className="tr-caret" />}
                {ch}
              </span>
            );
          })}
          {input.length > w.length && <span style={{ color: "var(--tr-bad)" }}>{input.slice(w.length)}</span>}
          {input.length >= w.length && <span style={{ position: "relative" }}><span className="tr-caret" /></span>}
        </span>
      );
    }
    return <span key={i} className="tr-word" style={{ color: "var(--tr-dim)" }}>{w}</span>;
  }

  return (
    <div className="tr-wrap">
      {/* Asosiy maydon — poyga */}
      <div style={{ textAlign: "left", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 16 }}>⌨️ Tezkor yozish</strong>
          {startAt > 0 && !result ? (
            <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
              <span style={{ fontWeight: 800, fontSize: 26, color: "var(--primary)" }}>{liveWpm} <span style={{ fontSize: 13, fontWeight: 600 }}>WPM</span></span>
              <span style={{ fontWeight: 800, fontSize: 32, color: secsLeft <= 5 ? "var(--tr-bad)" : "var(--ink)" }}>{secsLeft}</span>
            </div>
          ) : (
            // Til tanlash — poyga boshlanmagan/ tugagan paytda ko'rinadi
            <div style={{ display: "flex", gap: 6 }}>
              {LANG_LABELS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => switchLang(key)}
                  style={{
                    padding: "4px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700,
                    cursor: "pointer", font: "inherit",
                    border: lang === key ? "2px solid var(--primary)" : "1px solid var(--tr-dim)",
                    background: lang === key ? "var(--primary-soft, rgba(76,141,255,0.12))" : "transparent",
                    color: lang === key ? "var(--primary)" : "inherit",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {result ? (
          <div className="tr-area" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", userSelect: "auto" }}>
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1, color: "var(--primary)" }}>{result.wpm}</div>
            <div className="muted" style={{ fontSize: 16, marginTop: 6 }}>WPM · Aniqlik: {result.acc}%</div>
            {/* Har tugatilgan poyga serverda JAMLANADIGAN bonus qo'shadi (jami 300 gacha) —
                qayta o'ynagan sari ball ortadi, o'yin boshida umumiy ballga qo'shiladi */}
            {totalBonus > 0 && (
              <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: "#16a34a" }}>
                🎁 Jamlangan bonus: {totalBonus} ball {totalBonus >= 300 ? "(maksimum!)" : ""}— o'yin boshida qo'shiladi
              </div>
            )}
            {totalBonus < 300 && (
              <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                Yana o'ynasangiz bonus qo'shilib boradi (jami 300 gacha)
              </div>
            )}
            <button className="btn" style={{ marginTop: 14 }} onClick={() => restart()}>🔄 Qayta o'ynash</button>
          </div>
        ) : (
          // Matn maydoni — bosilsa yashirin input fokuslanadi (klaviatura ochiladi)
          <div style={{ position: "relative" }} onClick={() => inputRef.current?.focus()}>
            <div ref={areaRef} className="tr-area">
              {words.map((w, i) => renderWord(w, i))}
            </div>
            {/* Fokus yo'q — ustida "bosing" qatlami */}
            {!focused && (
              <div className="tr-overlay">
                <span>👆 {startAt ? "Davom etish uchun bosing" : "Boshlash uchun shu yerga bosing"}</span>
              </div>
            )}
            {/* Yashirin input — barcha terish shu orqali */}
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              aria-label="Tezkor yozish maydoni"
              style={{
                position: "absolute", inset: 0, width: "100%", height: "100%",
                opacity: 0, border: "none", cursor: "pointer",
              }}
            />
          </div>
        )}
        {!result && (
          <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            So'zni terib <strong>bo'shliq</strong> bosing · {RACE_SECS} soniya
          </div>
        )}
      </div>

      {/* Jonli reyting — keng ekranda o'ngda panel, torда pastda */}
      {board.length > 0 && (
        <div className="tr-side">
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>🏆 Eng tezkorlar</div>
          {board.slice(0, 8).map((r, i) => (
            <div key={r.nickname + i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 10px", borderRadius: 10, fontSize: 15.5,
              background: r.nickname === myName ? "var(--primary-soft, rgba(76,141,255,0.12))" : undefined,
              fontWeight: r.nickname === myName ? 800 : 500,
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {r.avatar ? `${r.avatar} ` : ""}{r.nickname}
              </span>
              <span style={{ flexShrink: 0, marginLeft: 8 }}>{r.wpm} <span className="muted" style={{ fontSize: 12 }}>WPM</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
