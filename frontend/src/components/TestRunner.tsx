import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "../socket";

interface TestSlide {
  id: string;
  index: number;
  total: number;
  kind: string;
  type: string | null;
  timeLimit?: number;
  text?: string;
  imageUrl?: string;
  options?: { id: string; text: string; imageUrl?: string }[];
  blanksCount?: number;
  lefts?: { id: string; text: string }[];
  rights?: { id: string; text: string }[];
  items?: { id: string; text: string }[];
}
interface TestStateMsg {
  done: boolean;
  index?: number;
  total?: number;
  slide?: TestSlide;
  correct?: number;
  score?: number;
  error?: string;
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  if (j < 0 || j >= arr.length) return arr;
  const c = [...arr];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

export default function TestRunner({ pin, nickname }: { pin: string; nickname: string }) {
  const [slide, setSlide] = useState<TestSlide | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState<{ correct: number; total: number; score: number } | null>(null);

  // javob holatlari
  const [selected, setSelected] = useState<string[]>([]);
  const [openText, setOpenText] = useState("");
  const [fillVals, setFillVals] = useState<string[]>([]);
  const [matchMap, setMatchMap] = useState<Record<string, string>>({});
  const [reorder, setReorder] = useState<{ id: string; text: string }[]>([]);

  // taymer
  const [endsAt, setEndsAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const busy = useRef(false);

  const applyState = useCallback((r: TestStateMsg) => {
    busy.current = false;
    if (!r || r.error) return;
    if (r.done) {
      setDone({ correct: r.correct ?? 0, total: r.total ?? 0, score: r.score ?? 0 });
      setSlide(null);
      setEndsAt(0);
      return;
    }
    const s = r.slide!;
    setTotal(r.total ?? s.total);
    setSlide(s);
    setSelected([]);
    setOpenText("");
    setFillVals(s.blanksCount ? Array(s.blanksCount).fill("") : []);
    setMatchMap({});
    setReorder(s.items ? [...s.items] : []);
    setEndsAt(s.timeLimit ? Date.now() + s.timeLimit * 1000 : 0);
  }, []);

  // birinchi savolni olish
  useEffect(() => {
    getSocket().emit("test:get", { pin }, (r: TestStateMsg) => {
      setLoading(false);
      applyState(r);
    });
  }, [pin, applyState]);

  // taymer tiki
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const submit = useCallback(
    (answer: unknown) => {
      if (busy.current) return;
      busy.current = true;
      getSocket().emit("test:answer", { pin, answer }, (r: TestStateMsg) => applyState(r));
    },
    [pin, applyState],
  );

  // vaqt tugasa — avtomatik keyingisiga (joriy tanlov bilan)
  const remaining = endsAt ? Math.max(0, endsAt - now) : 0;
  useEffect(() => {
    if (!slide || !endsAt) return;
    if (remaining <= 0 && !busy.current) {
      // joriy tanlangan javobni yuboramiz (bo'sh bo'lsa ham — noto'g'ri sifatida)
      const t = slide.type;
      let ans: unknown = "";
      if (t === "MULTIPLE") ans = selected;
      else if (t === "OPEN") ans = openText.trim();
      else if (t === "FILL_BLANK") ans = fillVals;
      else if (t === "MATCH") ans = matchMap;
      else if (t === "REORDER") ans = reorder.map((x) => x.id);
      else ans = selected[0] ?? "";
      submit(ans);
    }
  }, [remaining, slide, endsAt, selected, openText, fillVals, matchMap, reorder, submit]);

  function fsBtn() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }

  // ---------- Natija (o'quvchiga faqat o'z natijasi) ----------
  if (done) {
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          <h1 style={{ marginTop: 0 }}>✅ Test yakunlandi!</h1>
          <p style={{ fontSize: 18 }}>Salom, {nickname}!</p>
          <div className="test-score-big">{done.score}<span>/100</span></div>
          <p style={{ fontSize: 18 }}>
            To'g'ri javoblar: <strong>{done.correct}</strong> / {done.total}
          </p>
          <p className="muted" style={{ marginTop: 8 }}>Natijangiz o'qituvchiga yuborildi.</p>
        </div>
      </div>
    );
  }

  if (loading || !slide) return <div className="center-screen">Test yuklanmoqda…</div>;

  const t = slide.type;
  const secs = Math.ceil(remaining / 1000);
  const tpct = slide.timeLimit ? Math.min(100, (remaining / (slide.timeLimit * 1000)) * 100) : 0;
  const low = tpct <= 25;
  const opts = slide.options ?? [];

  return (
    <div className="test-run">
      <div className="test-top">
        <div className="test-prog">
          Savol <strong>{slide.index + 1}</strong> / {total}
        </div>
        <div className="test-progbar"><div style={{ width: `${((slide.index) / Math.max(total, 1)) * 100}%` }} /></div>
        <div className="row" style={{ gap: 8 }}>
          {!!endsAt && (
            <span className="test-timer" style={{ color: low ? "var(--danger)" : "var(--ink)" }}>
              <span className="material-symbols-outlined">timer</span>{secs}s
            </span>
          )}
          <button className="icon-btn" onClick={fsBtn} title="To'liq ekran">
            <span className="material-symbols-outlined">fullscreen</span>
          </button>
        </div>
      </div>

      <div className="test-body">
        <h2 className="q-text">{slide.text}</h2>
        {slide.imageUrl && (
          <div className="center"><img src={slide.imageUrl} alt="" style={{ maxHeight: 220, borderRadius: 12 }} /></div>
        )}

        {/* SINGLE / TRUE_FALSE — tanlasa darhol keyingisiga */}
        {(t === "SINGLE" || t === "TRUE_FALSE") && (
          <div className="answers-grid">
            {opts.map((o, i) => (
              <button
                key={o.id}
                className={`answer-card ${o.imageUrl ? "has-img" : ""} ${selected.includes(o.id) ? "selected" : ""}`}
                onClick={() => { setSelected([o.id]); submit(o.id); }}
              >
                <span className={`opt-letter c-${i % 4}`}>{String.fromCharCode(65 + i)}</span>
                {o.imageUrl && <img className="opt-img" src={o.imageUrl} alt="" />}
                {o.text && <span>{o.text}</span>}
              </button>
            ))}
          </div>
        )}

        {/* MULTIPLE — bir nechta tanlab tasdiqlaydi */}
        {t === "MULTIPLE" && (
          <>
            <div className="answers-grid">
              {opts.map((o, i) => (
                <button
                  key={o.id}
                  className={`answer-card ${o.imageUrl ? "has-img" : ""} ${selected.includes(o.id) ? "selected" : ""}`}
                  onClick={() => setSelected((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))}
                >
                  <span className={`opt-letter c-${i % 4}`}>{String.fromCharCode(65 + i)}</span>
                  {o.imageUrl && <img className="opt-img" src={o.imageUrl} alt="" />}
                  {o.text && <span>{o.text}</span>}
                </button>
              ))}
            </div>
            <div className="spacer" />
            <button className="btn btn-lg btn-block" disabled={selected.length === 0} onClick={() => submit(selected)}>
              Keyingi →
            </button>
          </>
        )}

        {t === "DROPDOWN" && (
          <>
            <select value={selected[0] ?? ""} onChange={(e) => setSelected([e.target.value])}>
              <option value="">— tanlang —</option>
              {opts.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
            </select>
            <button className="btn btn-lg btn-block" disabled={!selected[0]} onClick={() => submit(selected[0])}>Keyingi →</button>
          </>
        )}

        {t === "OPEN" && (
          <>
            <input value={openText} onChange={(e) => setOpenText(e.target.value)} placeholder="Javobingizni yozing" />
            <button className="btn btn-lg btn-block" disabled={!openText.trim()} onClick={() => submit(openText.trim())}>Keyingi →</button>
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
            <button className="btn btn-lg btn-block" disabled={fillVals.some((v) => !v.trim())} onClick={() => submit(fillVals)}>Keyingi →</button>
          </>
        )}

        {t === "MATCH" && slide.lefts && slide.rights && (
          <>
            {slide.lefts.map((l) => (
              <div className="row" key={l.id} style={{ marginBottom: 8 }}>
                <strong style={{ minWidth: 120 }}>{l.text}</strong>
                <select value={matchMap[l.id] ?? ""} onChange={(e) => setMatchMap((m) => ({ ...m, [l.id]: e.target.value }))} style={{ marginBottom: 0 }}>
                  <option value="">— tanlang —</option>
                  {slide.rights!.map((r) => <option key={r.id} value={r.id}>{r.text}</option>)}
                </select>
              </div>
            ))}
            <div className="spacer" />
            <button className="btn btn-lg btn-block" disabled={slide.lefts.some((l) => !matchMap[l.id])} onClick={() => submit(matchMap)}>Keyingi →</button>
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
            <button className="btn btn-lg btn-block" onClick={() => submit(reorder.map((x) => x.id))}>Keyingi →</button>
          </>
        )}
      </div>
    </div>
  );
}
