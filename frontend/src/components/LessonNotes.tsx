import { lazy, Suspense, useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { api } from "../api";

// Quill og'ir — faqat "Tahrirlash" ochilganda yuklanadi
const RichEditor = lazy(() => import("./RichEditor"));

/** Dars matni HTML'ini ko'rsatishdan oldin brauzerda ham tozalaymiz (server bilan ikki qavat himoya). */
function safeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ["p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s", "blockquote", "pre", "code", "ol", "ul", "li", "a", "span"],
    ALLOWED_ATTR: ["href", "target", "rel", "class", "data-list"],
    ALLOWED_URI_REGEXP: /^(https?:|mailto:)/i,
  });
}

/** Ko'rinadigan matn bormi (faqat bo'sh teglar emas). */
function hasVisibleText(html: string): boolean {
  const d = document.createElement("div");
  d.innerHTML = safeHtml(html);
  return (d.textContent ?? "").replace(/\u00a0/g, " ").trim().length > 0;
}

// ---- Darsni ko'rish sahifasi ostidagi "Dars matni" va "Izohlar" bloklari ----
// Dars matni bo'sh bo'lsa: oddiy ustozga umuman ko'rinmaydi, tahrirlash huquqi borlarga
// faqat "Dars matni qo'shish" tugmasi chiqadi.

interface LessonComment {
  id: string;
  authorName: string;
  text: string;
  source: string; // VIEW | AFTER_LESSON
  createdAt: string;
  canDelete: boolean;
}
interface Notes {
  lessonText: string;
  lessonTextUpdatedAt: string | null;
  lessonTextUpdatedBy: string | null;
  canEditText: boolean;
  comments: LessonComment[];
}

export const COMMENT_MAX = 2000;
const TEXT_MAX = 60000; // HTML uzunligi (serverdagi chegara bilan bir xil)

function fmt(iso: string): string {
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Matndagi havolalarni bosiladigan qiladi (boshqa HTML yo'q — xavfsiz). */
function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/\S+)/g).map((part, k) =>
        /^https?:\/\//.test(part) ? (
          <a key={k} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default function LessonNotes({ quizId }: { quizId: string }) {
  const [notes, setNotes] = useState<Notes | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingText, setSavingText] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api<Notes>(`/quizzes/${quizId}/notes`)
      .then(setNotes)
      .catch(() => setNotes(null)); // ko'rish huquqi yo'q — bloklar ko'rinmaydi
  }, [quizId]);

  if (!notes) return null;

  async function saveText() {
    setSavingText(true);
    setError("");
    try {
      const r = await api<Pick<Notes, "lessonText" | "lessonTextUpdatedAt" | "lessonTextUpdatedBy">>(`/quizzes/${quizId}/lesson-text`, {
        method: "PUT",
        body: JSON.stringify({ text: draft }),
      });
      setNotes((n) => (n ? { ...n, ...r } : n));
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saqlab bo'lmadi");
    } finally {
      setSavingText(false);
    }
  }

  async function sendComment() {
    const text = comment.trim();
    if (!text) return;
    setSending(true);
    setError("");
    try {
      const r = await api<{ comment: LessonComment }>(`/quizzes/${quizId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text, source: "VIEW" }),
      });
      setNotes((n) => (n ? { ...n, comments: [r.comment, ...n.comments] } : n));
      setComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yuborib bo'lmadi");
    } finally {
      setSending(false);
    }
  }

  async function removeComment(id: string) {
    if (!confirm("Izohni o'chirasizmi?")) return;
    try {
      await api(`/quizzes/${quizId}/comments/${id}`, { method: "DELETE" });
      setNotes((n) => (n ? { ...n, comments: n.comments.filter((c) => c.id !== id) } : n));
    } catch (e) {
      setError(e instanceof Error ? e.message : "O'chirib bo'lmadi");
    }
  }

  const hasText = hasVisibleText(notes.lessonText);

  return (
    <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {error && <div className="error">{error}</div>}

      {/* ---- Dars matni ---- */}
      {editing ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>📖 Dars matni</h3>
          <Suspense fallback={<p className="muted">Tahrirlagich yuklanmoqda…</p>}>
            <RichEditor value={draft} onChange={setDraft} placeholder="Dars rejasi, tushuntirish matni, ustoz uchun eslatmalar…" />
          </Suspense>
          <div className="between" style={{ marginTop: 8, flexWrap: "wrap", gap: 8 }}>
            <span className={draft.length > TEXT_MAX ? "error text-sm" : "muted text-sm"}>
              {draft.length > TEXT_MAX ? "Matn juda uzun — qisqartiring" : "Matnni o'chirib saqlasangiz, bo'lim yashirinadi"}
            </span>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost" disabled={savingText} onClick={() => setEditing(false)}>Bekor qilish</button>
              <button className="btn" disabled={savingText || draft.length > TEXT_MAX} onClick={saveText}>{savingText ? "Saqlanmoqda…" : "Saqlash"}</button>
            </div>
          </div>
        </div>
      ) : hasText ? (
        <div className="card">
          <div className="between" style={{ gap: 8 }}>
            <h3 style={{ margin: 0 }}>📖 Dars matni</h3>
            {notes.canEditText && (
              <button className="btn btn-ghost" onClick={() => { setDraft(notes.lessonText); setEditing(true); }}>✏️ Tahrirlash</button>
            )}
          </div>
          <div className="lesson-rich" style={{ marginTop: 12 }} dangerouslySetInnerHTML={{ __html: safeHtml(notes.lessonText) }} />
          {notes.lessonTextUpdatedAt && (
            <p className="muted text-sm" style={{ margin: "12px 0 0" }}>
              Oxirgi o'zgarish: {fmt(notes.lessonTextUpdatedAt)}{notes.lessonTextUpdatedBy ? ` · ${notes.lessonTextUpdatedBy}` : ""}
            </p>
          )}
        </div>
      ) : notes.canEditText ? (
        <div>
          <button className="btn btn-ghost" onClick={() => { setDraft(""); setEditing(true); }}>➕ Dars matni qo'shish</button>
        </div>
      ) : null}

      {/* ---- Izohlar ---- */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>💬 Izohlar {notes.comments.length > 0 && <span className="muted">({notes.comments.length})</span>}</h3>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={COMMENT_MAX}
          placeholder="Dars haqida fikringiz yoki taklifingiz…"
        />
        <div className="between" style={{ marginTop: 8 }}>
          <span className="muted text-sm">{comment.length} / {COMMENT_MAX}</span>
          <button className="btn" disabled={sending || !comment.trim()} onClick={sendComment}>
            {sending ? "Yuborilmoqda…" : "Izoh qoldirish"}
          </button>
        </div>

        {notes.comments.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>Hali izoh yo'q.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {notes.comments.map((c) => (
              <div key={c.id} style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface-2)" }}>
                <div className="between" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span>
                    <strong>{c.authorName}</strong>{" "}
                    <span className="muted text-sm">· {fmt(c.createdAt)}</span>
                    {c.source === "AFTER_LESSON" && (
                      <span className="badge" style={{ marginLeft: 8 }}>💡 Dars yakunidan</span>
                    )}
                  </span>
                  {c.canDelete && (
                    <button className="btn btn-ghost" style={{ padding: "2px 8px" }} title="O'chirish" onClick={() => removeComment(c.id)}>🗑</button>
                  )}
                </div>
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 6 }}>
                  <Linkified text={c.text} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Dars yakunidagi "Darsni qanday yaxshilash mumkin?" oynasi — fikr dars izohlariga tushadi. */
export function ImproveLessonModal({ quizId, gameId, onClose }: { quizId: string; gameId?: string | null; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`/quizzes/${quizId}/comments`, {
        method: "POST",
        body: JSON.stringify({ text: text.trim(), source: "AFTER_LESSON", ...(gameId ? { gameId } : {}) }),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yuborib bo'lmadi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="card card-narrow" onClick={(e) => e.stopPropagation()} style={{ width: "min(560px, 100%)" }}>
        <div className="between">
          <h3 style={{ margin: 0 }}>💡 Darsni qanday yaxshilash mumkin?</h3>
          <button className="btn btn-ghost" disabled={busy} onClick={onClose}>✕</button>
        </div>
        {done ? (
          <>
            <p style={{ marginBottom: 16 }}>✅ Rahmat! Fikringiz dars izohlariga qo'shildi.</p>
            <button className="btn btn-block" onClick={onClose}>Yopish</button>
          </>
        ) : (
          <>
            <p className="muted text-sm" style={{ marginTop: 6 }}>
              Nima yaxshi bo'ldi, nima qiyin bo'ldi, qaysi slaydni o'zgartirish kerak? Fikringiz shu darsning izohlariga tushadi.
            </p>
            {error && <div className="error">{error}</div>}
            <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={COMMENT_MAX} placeholder="Fikringiz…" />
            <div className="between" style={{ marginTop: 8 }}>
              <span className="muted text-sm">{text.length} / {COMMENT_MAX}</span>
              <button className="btn" disabled={busy || !text.trim()} onClick={send}>{busy ? "Yuborilmoqda…" : "Yuborish"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
