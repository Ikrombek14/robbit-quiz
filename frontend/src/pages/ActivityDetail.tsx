import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Shell from "../components/Shell";
import Preview from "./Preview";
import { slideTitle, TYPE_LABELS } from "../slides";
import type { QType, Quiz } from "../types";

export default function ActivityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareLink = quiz ? `${window.location.origin}/s/${quiz.id}` : "";
  const hostLink = quiz ? `${window.location.origin}/h/${quiz.id}` : "";
  const [copiedHost, setCopiedHost] = useState(false);
  async function copyText(text: string, which: "play" | "host") {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard bloklangan bo'lishi mumkin */
    }
    if (which === "host") { setCopiedHost(true); setTimeout(() => setCopiedHost(false), 2000); }
    else { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  useEffect(() => {
    api<{ quiz: Quiz }>(`/quizzes/${id}`)
      .then((r) => setQuiz(r.quiz))
      .catch((e) => setError(e instanceof Error ? e.message : "Xatolik"));
  }, [id]);

  const questionCount = quiz?.slides.filter((s) => s.kind === "QUESTION").length ?? 0;
  const slideCount = quiz?.slides.length ?? 0;

  return (
    <Shell>
      <button className="btn btn-ghost" onClick={() => navigate("/library")}>
        ← Kutubxonam
      </button>

      {error && <div className="error" style={{ marginTop: 12 }}>{error}</div>}
      {!quiz ? (
        <p className="muted" style={{ marginTop: 16 }}>Yuklanmoqda…</p>
      ) : (
        <>
          <div className="between" style={{ marginTop: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 28, margin: 0 }}>{quiz.title}</h1>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                📑 {slideCount} ta slayd · ❓ {questionCount} ta savol
              </p>
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-ghost" onClick={() => navigate(`/quiz/${quiz.id}`)}>
                ✏️ Tahrirlash
              </button>
              <div style={{ position: "relative" }}>
                <button
                  className="btn btn-ghost"
                  disabled={slideCount === 0}
                  onClick={() => setShareOpen((o) => !o)}
                >
                  🔗 Ulashish
                </button>
                {shareOpen && (
                  <div className="share-menu">
                    <strong className="text-sm">🎤 Host havolasi (ustoz uchun)</strong>
                    <p className="muted text-sm" style={{ margin: "4px 0 8px" }}>
                      Boshqa ustoz havolani ochib, Gmail bilan kirib <b>host qiladi</b>:
                    </p>
                    <input readOnly value={hostLink} onClick={(e) => (e.target as HTMLInputElement).select()} style={{ marginBottom: 8 }} />
                    <button className="btn btn-block" onClick={() => copyText(hostLink, "host")}>
                      {copiedHost ? "✓ Nusxalandi" : "Host havolasini nusxalash"}
                    </button>

                    <div className="or-divider" style={{ margin: "12px 0" }}>—</div>

                    <strong className="text-sm">📝 Vazifa havolasi (o'quvchi uchun)</strong>
                    <p className="muted text-sm" style={{ margin: "4px 0 8px" }}>
                      O'quvchilar mustaqil bajaradi, natija <b>Sessiyalarda</b> chiqadi:
                    </p>
                    <input readOnly value={shareLink} onClick={(e) => (e.target as HTMLInputElement).select()} style={{ marginBottom: 8 }} />
                    <button className="btn btn-block btn-ghost" onClick={() => copyText(shareLink, "play")}>
                      {copied ? "✓ Nusxalandi" : "Vazifa havolasini nusxalash"}
                    </button>
                  </div>
                )}
              </div>
              <button className="btn btn-ghost" disabled={slideCount === 0} onClick={() => setShowPreview(true)}>
                👁 Preview
              </button>
              <button className="btn" disabled={slideCount === 0} onClick={() => navigate(`/host/${quiz.id}`)}>
                ▶ Boshlash
              </button>
            </div>
          </div>

          {quiz.description && <p style={{ marginTop: 12 }}>{quiz.description}</p>}

          <h3 style={{ marginTop: 24 }}>Slaydlar</h3>
          {slideCount === 0 ? (
            <div className="card">
              <p className="muted">Hali slayd yo'q. "Tahrirlash" bilan slayd va savollar qo'shing.</p>
            </div>
          ) : (
            <div className="detail-thumbs">
              {quiz.slides.map((s, i) => (
                <div className="detail-thumb" key={s.id ?? i}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <strong>{i + 1}</strong>
                    <span className="badge-mini">
                      {s.kind === "QUESTION" ? TYPE_LABELS[(s.type ?? "SINGLE") as QType] : "Slayd"}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {slideTitle(s)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showPreview && quiz && (
        <Preview title={quiz.title} slides={quiz.slides} onClose={() => setShowPreview(false)} />
      )}
    </Shell>
  );
}
