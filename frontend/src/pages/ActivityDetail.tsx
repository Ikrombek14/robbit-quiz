import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import Preview from "./Preview";
import { SlideView } from "./Preview";
import SlideScene from "../components/SlideScene";
import PdfSlide from "../components/PdfSlide";
import { slideTitle, TYPE_LABELS } from "../slides";
import type { QType, Quiz, Slide } from "../types";

// Slayd mini ko'rinishi (thumbnail rail uchun)
function ThumbBody({ slide }: { slide: Slide }) {
  if (slide.kind === "CONTENT") {
    return <SlideScene data={slide.data} rounded={8} />;
  }
  return (
    <div className="thumb-q">
      <span className="badge-mini">{TYPE_LABELS[(slide.type ?? "SINGLE") as QType]}</span>
      <div className="thumb-q-text">{slideTitle(slide)}</div>
    </div>
  );
}

export default function ActivityDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { teacher } = useAuth();
  const isAdmin = teacher?.isAdmin === true;
  const canCreate = !!(teacher?.isAdmin || teacher?.canCreate); // "slayd qilish" ruxsati

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedHost, setCopiedHost] = useState(false);

  const [index, setIndex] = useState(0);
  const [showAnswers, setShowAnswers] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const pdfRef = useRef<HTMLDivElement>(null);

  const shareLink = quiz ? `${window.location.origin}/s/${quiz.id}` : "";
  const hostLink = quiz ? `${window.location.origin}/h/${quiz.id}` : "";

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

  const slides = quiz?.slides ?? [];
  const slideCount = slides.length;
  const questionCount = slides.filter((s) => s.kind === "QUESTION").length;
  const current = slides[index];

  // Avtomatik o'tkazish (autoplay)
  useEffect(() => {
    if (!autoplay || slideCount === 0) return;
    const t = setInterval(() => {
      setShowAnswers(false);
      setIndex((i) => (i + 1) % slideCount);
    }, 4000);
    return () => clearInterval(t);
  }, [autoplay, slideCount]);

  // Klaviatura: chap/o'ng strelka
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showPreview) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, slideCount]);

  function go(dir: -1 | 1) {
    setShowAnswers(false);
    setIndex((i) => Math.min(slideCount - 1, Math.max(0, i + dir)));
  }

  // ---- PDF yuklab olish (faqat admin) ----
  async function downloadPdf() {
    if (!quiz || pdfBusy) return;
    setPdfBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const container = pdfRef.current;
      if (!container) throw new Error("Konteyner topilmadi");
      const nodes = Array.from(container.querySelectorAll<HTMLElement>("[data-pdf-slide]"));
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1280, 720] });
      for (let i = 0; i < nodes.length; i++) {
        const canvas = await html2canvas(nodes[i], { scale: 1.5, useCORS: true, backgroundColor: "#ffffff", logging: false });
        const img = canvas.toDataURL("image/jpeg", 0.9);
        if (i > 0) pdf.addPage([1280, 720], "landscape");
        pdf.addImage(img, "JPEG", 0, 0, 1280, 720);
      }
      const safe = quiz.title.replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim() || "taqdimot";
      pdf.save(`${safe}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF yaratishda xatolik");
    } finally {
      setPdfBusy(false);
    }
  }

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
          {/* Sarlavha + amallar */}
          <div className="between" style={{ marginTop: 16, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h1 style={{ fontSize: 28, margin: 0 }}>{quiz.title}</h1>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                📑 {slideCount} ta slayd · ❓ {questionCount} ta savol
              </p>
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {isAdmin && (
                <button className="btn btn-ghost" disabled={slideCount === 0 || pdfBusy} onClick={downloadPdf} title="PDF yuklab olish (admin)">
                  {pdfBusy ? "⏳ Tayyorlanmoqda…" : "📥 PDF yuklab olish"}
                </button>
              )}
              {canCreate && (
                <button className="btn btn-ghost" onClick={() => navigate(`/quiz/${quiz.id}`)}>
                  ✏️ Tahrirlash
                </button>
              )}
              <div style={{ position: "relative" }}>
                <button className="btn btn-ghost" disabled={slideCount === 0} onClick={() => setShareOpen((o) => !o)}>
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

          {slideCount === 0 ? (
            <div className="card" style={{ marginTop: 24 }}>
              <p className="muted">Hali slayd yo'q. "Tahrirlash" bilan slayd va savollar qo'shing.</p>
            </div>
          ) : (
            <div className="wg-layout">
              {/* Chap: thumbnail rail */}
              <div className="wg-rail">
                {slides.map((s, i) => (
                  <button
                    key={s.id ?? i}
                    className={`wg-thumb ${i === index ? "active" : ""}`}
                    onClick={() => { setShowAnswers(false); setIndex(i); }}
                  >
                    <span className="wg-thumb-num">{i + 1}</span>
                    <div className="wg-thumb-body"><ThumbBody slide={s} /></div>
                  </button>
                ))}
              </div>

              {/* O'ng: katta ko'rinish + boshqaruvlar */}
              <div className="wg-main">
                <div className="wg-stage">
                  {current && (
                    current.kind === "CONTENT"
                      ? <SlideScene data={current.data} rounded={12} />
                      : <div className="wg-q-box"><SlideView slide={current} showAnswers={showAnswers} /></div>
                  )}
                </div>

                <div className="wg-controls">
                  <label className="wg-toggle">
                    <input type="checkbox" checked={showAnswers} onChange={(e) => setShowAnswers(e.target.checked)} disabled={current?.kind !== "QUESTION"} />
                    <span>Javobni ko'rsatish</span>
                  </label>
                  <label className="wg-toggle">
                    <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} />
                    <span>Avto-namoyish</span>
                  </label>

                  <div className="row" style={{ marginLeft: "auto", gap: 8, alignItems: "center" }}>
                    <span className="muted text-sm">Slayd {index + 1} / {slideCount}</span>
                    <button className="icon-btn" onClick={() => go(-1)} disabled={index === 0} title="Oldingi">
                      <span className="material-symbols-outlined">chevron_left</span>
                    </button>
                    <button className="icon-btn" onClick={() => go(1)} disabled={index === slideCount - 1} title="Keyingi">
                      <span className="material-symbols-outlined">chevron_right</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {showPreview && quiz && (
        <Preview title={quiz.title} slides={quiz.slides} onClose={() => setShowPreview(false)} />
      )}

      {/* PDF eksport uchun yashirin konteyner (faqat admin yuklaganda ishlatiladi) */}
      {isAdmin && quiz && (
        <div ref={pdfRef} aria-hidden style={{ position: "fixed", left: -100000, top: 0, pointerEvents: "none", opacity: 0 }}>
          {slides.map((s, i) => (
            <div data-pdf-slide key={s.id ?? i}>
              <PdfSlide slide={s} showAnswers />
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
