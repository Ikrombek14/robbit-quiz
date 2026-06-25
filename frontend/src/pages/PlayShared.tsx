import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { checkAnswer } from "../slides";
import SlideScene from "../components/SlideScene";
import type { QType, Quiz } from "../types";

function shuffle<T>(a: T[]): T[] {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

export default function PlayShared() {
  const { id } = useParams();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState<"name" | "play" | "feedback" | "done">("name");
  const [name, setName] = useState("");
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);

  const [selected, setSelected] = useState<string[]>([]);
  const [openText, setOpenText] = useState("");
  const [fillVals, setFillVals] = useState<string[]>([]);
  const [matchMap, setMatchMap] = useState<Record<string, string>>({});
  const [rights, setRights] = useState<{ id: string; text: string }[]>([]);
  const [reorder, setReorder] = useState<{ id: string; text: string }[]>([]);
  const [last, setLast] = useState<{ correct: boolean; points: number } | null>(null);
  const resultsRef = useRef<{ index: number; text: string; correct: boolean }[]>([]);
  const postedRef = useRef(false);

  useEffect(() => {
    fetch(`/api/public/quizzes/${id}`)
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setQuiz(d.quiz)))
      .catch(() => setError("Yuklashda xatolik"));
  }, [id]);

  const slide = quiz?.slides[index];

  useEffect(() => {
    setSelected([]);
    setOpenText("");
    setMatchMap({});
    setLast(null);
    if (slide?.type === "FILL_BLANK") {
      const n = Math.max((slide.data.text ?? "").split("___").length - 1, (slide.data.blanks ?? []).length);
      setFillVals(Array(Math.max(n, 1)).fill(""));
    } else setFillVals([]);
    if (slide?.type === "MATCH") {
      setRights(shuffle((slide.data.pairs ?? []).map((p, i) => ({ id: String(i), text: p.right }))));
    } else setRights([]);
    if (slide?.type === "REORDER") {
      setReorder(shuffle((slide.data.items ?? []).map((t, i) => ({ id: String(i), text: t }))));
    } else setReorder([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, quiz]);

  const maxScore = quiz?.slides.filter((s) => s.kind === "QUESTION" && s.type !== "POLL").reduce((a, s) => a + s.points, 0) ?? 0;

  function answer(a: unknown) {
    if (!slide) return;
    const correct = checkAnswer(slide, a);
    const pts = slide.type === "POLL" ? 0 : correct ? slide.points : 0;
    if (slide.type !== "POLL") {
      resultsRef.current.push({ index, text: slide.data.text ?? `Savol ${index + 1}`, correct });
    }
    setScore((s) => s + pts);
    setLast({ correct, points: pts });
    setPhase("feedback");
  }

  // Yakunlanganda natijani o'qituvchiga saqlash
  useEffect(() => {
    if (phase !== "done" || postedRef.current) return;
    postedRef.current = true;
    const r = resultsRef.current;
    fetch(`/api/public/quizzes/${id}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: name,
        score,
        correctCount: r.filter((x) => x.correct).length,
        totalAnswered: r.length,
        perQuestion: r,
      }),
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  function next() {
    if (!quiz) return;
    if (index + 1 >= quiz.slides.length) {
      setPhase("done");
      return;
    }
    setIndex((i) => i + 1);
    setPhase("play");
  }

  // ---------- Yuklash / xato ----------
  if (error)
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          <div className="error">{error}</div>
        </div>
      </div>
    );
  if (!quiz) return <div className="center-screen">Yuklanmoqda…</div>;

  // ---------- Ism ----------
  if (phase === "name")
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          <h2 style={{ marginTop: 0 }}>{quiz.title}</h2>
          <p className="muted">{quiz.slides.length} ta slayd</p>
          <label style={{ textAlign: "left" }}>Ismingiz</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Ism" />
          <button
            className="btn btn-block btn-lg"
            disabled={!name.trim() || quiz.slides.length === 0}
            onClick={() => setPhase("play")}
          >
            Boshlash →
          </button>
        </div>
      </div>
    );

  // ---------- Yakun ----------
  if (phase === "done")
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          <h1>🎉 Tugadi!</h1>
          <p style={{ fontSize: 18 }}>Salom, {name}!</p>
          <p style={{ fontSize: 26, fontWeight: 700 }}>
            {score} {maxScore > 0 && <span className="muted" style={{ fontSize: 18 }}>/ {maxScore}</span>} ball
          </p>
        </div>
      </div>
    );

  if (!slide) return null;

  // ---------- Feedback ----------
  if (phase === "feedback")
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          {slide.type === "POLL" ? (
            <h1>🗳️ Qabul qilindi</h1>
          ) : last?.correct ? (
            <>
              <h1>✅ To'g'ri!</h1>
              {last.points > 0 && <p style={{ fontSize: 22 }}>+{last.points} ball</p>}
            </>
          ) : (
            <h1>❌ Xato</h1>
          )}
          <p className="muted">Umumiy ball: {score}</p>
          <button className="btn btn-block btn-lg" onClick={next}>
            {index + 1 >= quiz.slides.length ? "Yakunlash" : "Keyingi →"}
          </button>
        </div>
      </div>
    );

  // ---------- Kontent slayd ----------
  if (slide.kind === "CONTENT")
    return (
      <div className="present-stage">
        <div className="stu-slide-wrap"><SlideScene data={slide.data} /></div>
        <div className="center" style={{ marginTop: 12 }}>
          <button className="btn btn-lg" onClick={next}>
            {index + 1 >= quiz.slides.length ? "Yakunlash" : "Keyingi →"}
          </button>
        </div>
      </div>
    );

  // ---------- Savol ----------
  const t = (slide.type ?? "SINGLE") as QType;
  const options = slide.data.options ?? [];

  return (
    <div className="present-stage">
      <div className="center">
        <span className="badge">Savol {index + 1}</span>
      </div>
      <h2 className="q-text">{slide.data.text}</h2>
      {slide.data.imageUrl && (
        <div className="center">
          <img src={slide.data.imageUrl} alt="" style={{ maxHeight: 220, borderRadius: 12 }} />
        </div>
      )}

      {(t === "SINGLE" || t === "TRUE_FALSE" || t === "POLL" || t === "MULTIPLE") && (
        <>
          <div className="answers-grid">
            {options.map((o, i) => (
              <button
                key={i}
                className={`answer-card ${o.imageUrl ? "has-img" : ""} ${selected.includes(String(i)) ? "selected" : ""}`}
                onClick={() =>
                  t === "MULTIPLE"
                    ? setSelected((s) => (s.includes(String(i)) ? s.filter((x) => x !== String(i)) : [...s, String(i)]))
                    : answer(String(i))
                }
              >
                <span className={`opt-letter c-${i % 4}`}>{String.fromCharCode(65 + i)}</span>
                {o.imageUrl && <img className="opt-img" src={o.imageUrl} alt="" />}
                {o.text && <span>{o.text}</span>}
              </button>
            ))}
          </div>
          {t === "MULTIPLE" && (
            <button className="btn btn-lg btn-block" disabled={selected.length === 0} onClick={() => answer(selected)}>
              Javob berish
            </button>
          )}
        </>
      )}

      {t === "DROPDOWN" && (
        <>
          <select value={selected[0] ?? ""} onChange={(e) => setSelected([e.target.value])}>
            <option value="">— tanlang —</option>
            {options.map((o, i) => (
              <option key={i} value={String(i)}>{o.text}</option>
            ))}
          </select>
          <button className="btn btn-lg btn-block" disabled={!selected[0]} onClick={() => answer(selected[0])}>
            Javob berish
          </button>
        </>
      )}

      {t === "OPEN" && (
        <>
          <input value={openText} onChange={(e) => setOpenText(e.target.value)} placeholder="Javobingiz" />
          <button className="btn btn-lg btn-block" disabled={!openText.trim()} onClick={() => answer(openText.trim())}>
            Javob berish
          </button>
        </>
      )}

      {t === "FILL_BLANK" && (
        <>
          {fillVals.map((v, i) => (
            <div key={i}>
              <label>Bo'sh joy #{i + 1}</label>
              <input value={v} onChange={(e) => setFillVals((arr) => arr.map((x, idx) => (idx === i ? e.target.value : x)))} />
            </div>
          ))}
          <button className="btn btn-lg btn-block" disabled={fillVals.some((v) => !v.trim())} onClick={() => answer(fillVals)}>
            Javob berish
          </button>
        </>
      )}

      {t === "MATCH" && (
        <>
          {(slide.data.pairs ?? []).map((p, i) => (
            <div className="row" key={i} style={{ marginBottom: 8 }}>
              <strong style={{ minWidth: 120 }}>{p.left}</strong>
              <select
                value={matchMap[String(i)] ?? ""}
                onChange={(e) => setMatchMap((m) => ({ ...m, [String(i)]: e.target.value }))}
                style={{ marginBottom: 0 }}
              >
                <option value="">— tanlang —</option>
                {rights.map((r) => (
                  <option key={r.id} value={r.id}>{r.text}</option>
                ))}
              </select>
            </div>
          ))}
          <button
            className="btn btn-lg btn-block"
            disabled={(slide.data.pairs ?? []).some((_, i) => !matchMap[String(i)])}
            onClick={() => answer(matchMap)}
          >
            Javob berish
          </button>
        </>
      )}

      {t === "REORDER" && (
        <>
          {reorder.map((it, i) => (
            <div className="row" key={it.id} style={{ marginBottom: 8 }}>
              <span className="badge">{i + 1}</span>
              <span style={{ flex: 1 }}>{it.text}</span>
              <button className="btn btn-ghost" onClick={() => setReorder((a) => swap(a, i, i - 1))}>▲</button>
              <button className="btn btn-ghost" onClick={() => setReorder((a) => swap(a, i, i + 1))}>▼</button>
            </div>
          ))}
          <button className="btn btn-lg btn-block" onClick={() => answer(reorder.map((x) => x.id))}>
            Javob berish
          </button>
        </>
      )}
    </div>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  if (j < 0 || j >= arr.length) return arr;
  const c = [...arr];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}
