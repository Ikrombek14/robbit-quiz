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
        <div className="preview-slide">{slide && <SlideView slide={slide} showAnswers={showAnswers} />}</div>
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

export function SlideView({ slide, showAnswers }: { slide: Slide; showAnswers: boolean }) {
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
      <QuestionView type={type} slide={slide} showAnswers={showAnswers} />
    </div>
  );
}

function QuestionView({ type, slide, showAnswers }: { type: QType; slide: Slide; showAnswers: boolean }) {
  const d = slide.data;

  if (["SINGLE", "MULTIPLE", "TRUE_FALSE", "DROPDOWN", "POLL"].includes(type)) {
    const options = d.options ?? [];
    const showCorrect = showAnswers && type !== "POLL";
    return (
      <div className="answers-grid">
        {options.map((o, i) => (
          <div
            key={i}
            className={`answer-card ${o.imageUrl ? "has-img" : ""} ${showCorrect ? (o.isCorrect ? "correct" : "wrong") : ""}`}
          >
            <span className={`opt-letter c-${i % 4}`}>{String.fromCharCode(65 + i)}</span>
            {o.imageUrl && <img className="opt-img" src={o.imageUrl} alt="" />}
            {(o.text || !o.imageUrl) && <span>{o.text || `Variant ${i + 1}`}</span>}
          </div>
        ))}
      </div>
    );
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
