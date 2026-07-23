import { useState } from "react";
import type { QType, Slide } from "../types";
import { TYPE_LABELS } from "../slides";
import SlideScene from "../components/SlideScene";

export default function Preview({
  title,
  slides,
  onClose,
}: {
  title: string;
  slides: Slide[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [showAnswers, setShowAnswers] = useState(false);
  const slide = slides[index];

  function go(dir: -1 | 1) {
    setShowAnswers(false);
    setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + dir)));
  }

  return (
    <div className="preview-overlay">
      <div className="preview-bar">
        <span className="badge">
          {index + 1} / {slides.length}
        </span>
        <strong>{title}</strong>
        <button className="btn btn-ghost" onClick={onClose}>
          ✕ Yopish
        </button>
      </div>

      <div className="preview-stage">
        <div className="preview-slide">{slide && <SlideView key={index} slide={slide} showAnswers={showAnswers} interactive />}</div>
      </div>

      <div className="preview-controls">
        <button className="btn btn-ghost" onClick={() => go(-1)} disabled={index === 0}>
          ← Previous
        </button>
        {slide?.kind === "QUESTION" && (
          <button className="btn" onClick={() => setShowAnswers((s) => !s)}>
            {showAnswers ? "🙈 Javoblarni yashirish" : "👁 Show answers"}
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => go(1)} disabled={index === slides.length - 1}>
          Next →
        </button>
      </div>
    </div>
  );
}

// interactive=true bo'lsa: variantlar BOSILADI — ustoz bosgach to'g'ri javob
// ochiladi (workshop/preview'da o'z-o'zini tekshirish uchun). Slayd almashganda
// tanlov nolga qaytishi uchun chaqiruvchi tomonda `key={slide.id}` beriladi.
export function SlideView({ slide, showAnswers, interactive }: { slide: Slide; showAnswers: boolean; interactive?: boolean }) {
  const d = slide.data;

  if (slide.kind === "CONTENT") {
    return <SlideScene data={d} />;
  }

  const type = (slide.type ?? "SINGLE") as QType;
  return (
    <div>
      <span className="badge">{TYPE_LABELS[type]}</span>
      <h2 className="q-text">{d.text}</h2>
      {d.imageUrl && (
        <div className="center">
          <img src={d.imageUrl} alt="" style={{ maxHeight: 200, borderRadius: 12 }} />
        </div>
      )}
      <QuestionView type={type} slide={slide} showAnswers={showAnswers} interactive={interactive} />
    </div>
  );
}

// Bosiladigan variantlar (SINGLE/MULTIPLE/TRUE_FALSE/DROPDOWN). Bosilgach to'g'ri
// javob(lar) yashil, xato tanlangani qizil bo'ladi. POLL'da to'g'ri javob yo'q.
function ChoiceOptions({
  type, options, showAnswers, interactive,
}: {
  type: QType;
  options: NonNullable<Slide["data"]["options"]>;
  showAnswers: boolean;
  interactive?: boolean;
}) {
  const isPoll = type === "POLL";
  const isMultiple = type === "MULTIPLE";
  const [picked, setPicked] = useState<number[]>([]);
  const canClick = !!interactive && !isPoll;
  const hasPicked = picked.length > 0;
  // To'g'ri javobni ko'rsatamiz: checkbox yoqilgan YOKI biror variant bosilgan bo'lsa
  const reveal = !isPoll && (showAnswers || hasPicked);

  function pick(i: number) {
    if (!canClick) return;
    if (isMultiple) {
      setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
    } else {
      setPicked((p) => (p.includes(i) ? [] : [i])); // qayta bosilsa — bekor
    }
  }

  return (
    <div className="answers-grid">
      {options.map((o, i) => {
        const isPicked = picked.includes(i);
        let state = "";
        if (reveal) {
          if (o.isCorrect) state = "correct";
          else if (isPicked) state = "wrong-pick"; // bosilgan, lekin xato
          else state = "wrong"; // xira
        } else if (isPicked) {
          state = "selected";
        }
        const cls = `answer-card ${o.imageUrl ? "has-img" : ""} ${state}`;
        const body = (
          <>
            <span className={`opt-letter c-${i % 4}`}>{String.fromCharCode(65 + i)}</span>
            {o.imageUrl && <img className="opt-img" src={o.imageUrl} alt="" />}
            {(o.text || !o.imageUrl) && <span>{o.text || `Variant ${i + 1}`}</span>}
            {reveal && o.isCorrect && <span className="opt-mark ok">✓</span>}
            {reveal && isPicked && !o.isCorrect && <span className="opt-mark no">✕</span>}
          </>
        );
        return canClick ? (
          <button key={i} type="button" className={cls} onClick={() => pick(i)}>{body}</button>
        ) : (
          <div key={i} className={cls}>{body}</div>
        );
      })}
    </div>
  );
}

function QuestionView({ type, slide, showAnswers, interactive }: { type: QType; slide: Slide; showAnswers: boolean; interactive?: boolean }) {
  const d = slide.data;

  if (["SINGLE", "MULTIPLE", "TRUE_FALSE", "DROPDOWN", "POLL"].includes(type)) {
    return <ChoiceOptions type={type} options={d.options ?? []} showAnswers={showAnswers} interactive={interactive} />;
  }

  if (type === "OPEN") {
    return (
      <div className="card">
        <input disabled placeholder="O'quvchi javobi…" />
        {showAnswers && <p className="muted">To'g'ri: {(d.answers ?? []).join(", ")}</p>}
      </div>
    );
  }

  if (type === "FILL_BLANK") {
    const blanks = d.blanks ?? [];
    let bi = -1;
    const parts = (d.text ?? "").split("___");
    return (
      <p style={{ fontSize: 22, lineHeight: 2 }}>
        {parts.map((part, i) => {
          if (i === parts.length - 1) return <span key={i}>{part}</span>;
          bi += 1;
          const ans = showAnswers ? (blanks[bi]?.[0] ?? "") : "______";
          return (
            <span key={i}>
              {part}
              <span className="blank">{ans}</span>
            </span>
          );
        })}
      </p>
    );
  }

  if (type === "MATCH") {
    const pairs = d.pairs ?? [];
    return (
      <div className="match-grid">
        <div>
          {pairs.map((p, i) => (
            <div className="match-cell" key={i}>{p.left}</div>
          ))}
        </div>
        <div>
          {pairs.map((p, i) => (
            <div className="match-cell" key={i}>
              {showAnswers ? `→ ${p.right}` : p.right}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === "REORDER") {
    const items = d.items ?? [];
    return (
      <ol className="reorder-list">
        {items.map((it, i) => (
          <li key={i}>
            {showAnswers && <strong>{i + 1}. </strong>}
            {it}
          </li>
        ))}
      </ol>
    );
  }

  return null;
}
