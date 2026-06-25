import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, uploadBlob } from "../api";
import type { ChoiceOption, QType, Quiz, Slide, SlideData } from "../types";
import { QUESTION_TYPES, newContentSlide, newQuestionSlide, slideTitle, TYPE_LABELS } from "../slides";
import { pdfToPngBlobs } from "../pdf";
import SlideCanvas from "../components/SlideCanvas";
import Preview from "./Preview";

// Fayl tanlab serverga yuklaydi, URL qaytaradi
async function pickAndUploadImage(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        resolve(await uploadBlob(f, f.name));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

export default function QuizEditor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [shuffle, setShuffle] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [selected, setSelected] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuestion, setAddQuestion] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const excelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<{ quiz: Quiz }>(`/quizzes/${id}`)
      .then((r) => {
        setTitle(r.quiz.title);
        setDescription(r.quiz.description ?? "");
        setShuffle(r.quiz.shuffle);
        setSlides(r.quiz.slides);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Xatolik"))
      .finally(() => setLoading(false));
  }, [id]);

  function updateSlide(i: number, s: Slide) {
    setSlides((arr) => arr.map((x, idx) => (idx === i ? s : x)));
  }
  function addSlide(s: Slide) {
    setSlides((arr) => {
      const next = [...arr, s];
      setSelected(next.length - 1);
      return next;
    });
    setAddOpen(false);
    setAddQuestion(false);
  }
  function removeSlide(i: number) {
    setSlides((arr) => arr.filter((_, idx) => idx !== i));
    setSelected((s) => Math.max(0, s > i ? s - 1 : s));
  }
  function moveTo(from: number | null, to: number) {
    if (from === null || from === to) return;
    setSlides((arr) => {
      const copy = [...arr];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
    setSelected(to);
    setDragIndex(null);
  }

  async function importPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setAddOpen(false);
    setImporting(true);
    setError("");
    try {
      setProgress("PDF o'qilmoqda…");
      const blobs = await pdfToPngBlobs(file, (d, t) => setProgress(`Sahifa ${d} / ${t} tayyorlanmoqda…`));
      const created: Slide[] = [];
      for (let i = 0; i < blobs.length; i++) {
        setProgress(`Yuklanmoqda: ${i + 1} / ${blobs.length}`);
        const url = await uploadBlob(blobs[i], `page-${i + 1}.png`);
        created.push({
          kind: "CONTENT",
          type: null,
          data: { title: `Sahifa ${i + 1}`, body: "", imageUrl: url },
          notes: "",
          timeLimit: 20,
          points: 0,
        });
      }
      setSlides((arr) => {
        const next = [...arr, ...created];
        setSelected(arr.length);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF import xatosi");
    } finally {
      setImporting(false);
      setProgress("");
    }
  }

  async function importExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (excelRef.current) excelRef.current.value = "";
    if (!file) return;
    setAddOpen(false);
    setImporting(true);
    setError("");
    try {
      setProgress("Excel o'qilmoqda…");
      const fd = new FormData();
      fd.append("file", file, file.name);
      const r = await api<{
        slides: Slide[];
        summary: { total: number; single: number; multiple: number; poll: number; written: number; skipped: number };
      }>("/excel/import", { method: "POST", body: fd });
      setSlides((arr) => {
        const next = [...arr, ...r.slides];
        setSelected(arr.length);
        return next;
      });
      const s = r.summary;
      const variant = s.single + s.multiple;
      setProgress(
        `✅ ${s.total} savol qo'shildi — variantli: ${variant}, yozma: ${s.written}` +
          (s.poll ? `, so'rovnoma: ${s.poll}` : "") +
          (s.skipped ? ` (${s.skipped} o'tkazib yuborildi)` : ""),
      );
      setTimeout(() => setProgress(""), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Excel import xatosi");
      setProgress("");
    } finally {
      setImporting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api(`/quizzes/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title, description, shuffle, slides }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Saqlashda xatolik");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="container">Yuklanmoqda…</div>;

  const current = slides[selected];

  return (
    <>
      {/* Top bar */}
      <div className="topbar">
        <div className="row">
          <button className="icon-btn" onClick={() => navigate("/dashboard")} title="Orqaga">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ margin: 0, width: 320, fontWeight: 700 }}
          />
          <span className="muted">{slides.length} slayd</span>
        </div>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => setShowSettings(true)}>
            ⚙ Settings
          </button>
          <button className="btn btn-ghost" disabled={slides.length === 0} onClick={() => setShowPreview(true)}>
            ▶ Preview
          </button>
          <button className="btn" onClick={save} disabled={saving}>
            {saving ? "Saqlanmoqda…" : "💾 Save changes"}
          </button>
        </div>
      </div>

      {error && <div className="error" style={{ margin: 16 }}>{error}</div>}

      <div className="editor-layout">
        {/* Thumbnails */}
        <aside className="thumbs">
          <input ref={fileRef} type="file" accept="application/pdf" onChange={importPdf} style={{ display: "none" }} />
          <input
            ref={excelRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={importExcel}
            style={{ display: "none" }}
          />
          {progress && <div className="import-progress">{importing ? "⏳ " : ""}{progress}</div>}
          <div style={{ position: "relative" }}>
            <button className="btn btn-block" disabled={importing} onClick={() => { setAddOpen((o) => !o); setAddQuestion(false); }}>
              + Add
            </button>
            {addOpen && (
              <div className="add-menu">
                {!addQuestion ? (
                  <>
                    <button className="add-item" onClick={() => addSlide(newContentSlide())}>
                      🖼️ Slide (kontent)
                    </button>
                    <button className="add-item" onClick={() => setAddQuestion(true)}>
                      ❓ Question →
                    </button>
                    <button className="add-item" onClick={() => fileRef.current?.click()}>
                      📄 PDF import (sahifalar → slayd)
                    </button>
                    <button className="add-item" onClick={() => excelRef.current?.click()}>
                      📊 Excel import (savollar shabloni)
                    </button>
                  </>
                ) : (
                  <>
                    <button className="add-item muted" onClick={() => setAddQuestion(false)}>
                      ← orqaga
                    </button>
                    {QUESTION_TYPES.map((q) => (
                      <button key={q.type} className="add-item" onClick={() => addSlide(newQuestionSlide(q.type))}>
                        {q.icon} {q.label}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="thumb-list">
            {slides.map((s, i) => (
              <div
                key={i}
                className={`thumb ${i === selected ? "active" : ""} ${dragIndex === i ? "dragging" : ""}`}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => moveTo(dragIndex, i)}
                onDragEnd={() => setDragIndex(null)}
                onClick={() => setSelected(i)}
                title="Tortib o'rnini almashtiring"
              >
                <span className="thumb-num">{i + 1}</span>
                <div className="thumb-preview">
                  {s.kind === "CONTENT" && s.data.imageUrl ? (
                    <img src={s.data.imageUrl} alt="" draggable={false} />
                  ) : (
                    <div className="thumb-mini">
                      {s.kind === "QUESTION" && (
                        <span className="badge-mini">{TYPE_LABELS[(s.type ?? "SINGLE") as QType]}</span>
                      )}
                      <span className="thumb-mini-text">{slideTitle(s)}</span>
                    </div>
                  )}
                  <button
                    className="thumb-del"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSlide(i);
                    }}
                    title="O'chirish"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
            {slides.length === 0 && <p className="muted center">Slayd qo'shing →</p>}
          </div>
        </aside>

        {/* Editor */}
        <main className="editor-main">
          {current ? (
            <>
              <SlideEditor slide={current} onChange={(s) => updateSlide(selected, s)} />
              <div className="card" style={{ marginTop: 16 }}>
                <label>Slide notes (faqat siz ko'rasiz)</label>
                <textarea
                  rows={2}
                  value={current.notes ?? ""}
                  onChange={(e) => updateSlide(selected, { ...current, notes: e.target.value })}
                  placeholder="Taqdimotchi izohlari…"
                />
              </div>
            </>
          ) : (
            <div className="card center muted">Chap tomondan slayd tanlang yoki "+ Add" bosing.</div>
          )}
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          title={title}
          description={description}
          shuffle={shuffle}
          onChange={(p) => {
            if (p.title !== undefined) setTitle(p.title);
            if (p.description !== undefined) setDescription(p.description);
            if (p.shuffle !== undefined) setShuffle(p.shuffle);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showPreview && <Preview title={title} slides={slides} onClose={() => setShowPreview(false)} />}
    </>
  );
}

/* ============ Settings ============ */
function SettingsModal(props: {
  title: string;
  description: string;
  shuffle: boolean;
  onChange: (p: { title?: string; description?: string; shuffle?: boolean }) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="card card-narrow" onClick={(e) => e.stopPropagation()}>
        <div className="between">
          <h3 style={{ margin: 0 }}>⚙ Settings</h3>
          <button className="btn btn-ghost" onClick={props.onClose}>✕</button>
        </div>
        <div className="spacer" />
        <label>Nomi</label>
        <input value={props.title} onChange={(e) => props.onChange({ title: e.target.value })} />
        <label>Tavsif</label>
        <input value={props.description} onChange={(e) => props.onChange({ description: e.target.value })} />
        <label className="row" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            style={{ width: 20, margin: 0 }}
            checked={props.shuffle}
            onChange={(e) => props.onChange({ shuffle: e.target.checked })}
          />
          Savollarni aralashtirish
        </label>
        <div className="spacer" />
        <button className="btn btn-block" onClick={props.onClose}>Tayyor</button>
      </div>
    </div>
  );
}

/* ============ Slide editor (turlar bo'yicha) ============ */
function SlideEditor({ slide, onChange }: { slide: Slide; onChange: (s: Slide) => void }) {
  const setData = (patch: Partial<SlideData>) => onChange({ ...slide, data: { ...slide.data, ...patch } });

  if (slide.kind === "CONTENT") {
    const isImageSlide = !!slide.data.imageUrl;
    return (
      <div className="card">
        <span className="badge">🖼️ Kontent slayd</span>
        <div style={{ margin: "12px 0" }}>
          <SlideCanvas title={slide.data.title} body={slide.data.body} imageUrl={slide.data.imageUrl} />
        </div>
        {/* PDF/rasm sahifasi bo'lsa, tahrirlash maydonlari kerak emas */}
        {!isImageSlide && (
          <>
            <label>Sarlavha</label>
            <input value={slide.data.title ?? ""} onChange={(e) => setData({ title: e.target.value })} />
            <label>Matn</label>
            <textarea rows={4} value={slide.data.body ?? ""} onChange={(e) => setData({ body: e.target.value })} />
            <label>Rasm (URL, ixtiyoriy)</label>
            <input
              value={slide.data.imageUrl ?? ""}
              onChange={(e) => setData({ imageUrl: e.target.value })}
              placeholder="https://…"
            />
          </>
        )}
      </div>
    );
  }

  const type = (slide.type ?? "SINGLE") as QType;
  return (
    <div>
      {/* Toolbar: tur / ball / vaqt */}
      <div className="wg-toolbar">
        <select
          className="wg-tb-select"
          value={type}
          onChange={(e) => onChange({ ...slide, type: e.target.value as QType })}
        >
          {QUESTION_TYPES.map((q) => (
            <option key={q.type} value={q.type}>
              {q.label}
            </option>
          ))}
        </select>
        {type !== "POLL" && (
          <span className="wg-tb-field">
            <span className="material-symbols-outlined">star</span>
            <input
              type="number"
              min={0}
              max={2000}
              value={slide.points}
              onChange={(e) => onChange({ ...slide, points: Number(e.target.value) })}
            />
            ball
          </span>
        )}
        <span className="wg-tb-field">
          <span className="material-symbols-outlined">timer</span>
          <input
            type="number"
            min={5}
            max={300}
            value={slide.timeLimit}
            onChange={(e) => onChange({ ...slide, timeLimit: Number(e.target.value) })}
          />
          s
        </span>
      </div>

      {/* Savol maydoni */}
      <div className="wg-question">
        <div className="wg-q-tools">
          <button
            className="wg-opt-icon"
            title="Rasm yuklash"
            onClick={async () => {
              const u = await pickAndUploadImage();
              if (u) setData({ imageUrl: u });
            }}
          >
            <span className="material-symbols-outlined">image</span>
          </button>
        </div>
        {slide.data.imageUrl && (
          <div className="wg-q-imgwrap">
            <img src={slide.data.imageUrl} alt="" />
            <button className="opt-img-x" onClick={() => setData({ imageUrl: "" })}>
              ✕
            </button>
          </div>
        )}
        <textarea
          className="wg-q-text"
          value={slide.data.text ?? ""}
          placeholder="Savol matnini bu yerga yozing…"
          onChange={(e) => setData({ text: e.target.value })}
        />
      </div>

      <QuestionBody type={type} data={slide.data} setData={setData} />

      {(type === "SINGLE" || type === "MULTIPLE") && (
        <label className="row" style={{ cursor: "pointer", marginTop: 14 }}>
          <input
            type="checkbox"
            checked={type === "MULTIPLE"}
            onChange={(e) => onChange({ ...slide, type: e.target.checked ? "MULTIPLE" : "SINGLE" })}
            style={{ width: 20, height: 20, margin: 0 }}
          />
          Bir nechta to'g'ri javob
        </label>
      )}
    </div>
  );
}

function QuestionBody({
  type,
  data,
  setData,
}: {
  type: QType;
  data: SlideData;
  setData: (p: Partial<SlideData>) => void;
}) {
  // Variantli turlar
  if (["SINGLE", "MULTIPLE", "TRUE_FALSE", "DROPDOWN", "POLL"].includes(type)) {
    const options = data.options ?? [];
    const hasCorrect = type !== "POLL";
    const multi = type === "MULTIPLE";
    const fixed = type === "TRUE_FALSE";

    const setOptions = (opts: ChoiceOption[]) => setData({ options: opts });
    const toggle = (i: number) => {
      if (!hasCorrect) return;
      setOptions(
        multi
          ? options.map((o, idx) => (idx === i ? { ...o, isCorrect: !o.isCorrect } : o))
          : options.map((o, idx) => ({ ...o, isCorrect: idx === i })),
      );
    };

    return (
      <div className="wg-answers">
        {options.map((o, i) => (
          <div className={`wg-opt wg-c${i % 4} ${hasCorrect && o.isCorrect ? "is-correct" : ""}`} key={i}>
            <div className="wg-opt-top">
              {!fixed && (
                <button
                  className="wg-opt-icon"
                  title="O'chirish"
                  onClick={() => setOptions(options.filter((_, idx) => idx !== i))}
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              )}
              {o.imageUrl ? (
                <button
                  className="wg-opt-icon"
                  title="Rasmni olib tashlash"
                  onClick={() => setOptions(options.map((x, idx) => (idx === i ? { ...x, imageUrl: undefined } : x)))}
                >
                  <span className="material-symbols-outlined">hide_image</span>
                </button>
              ) : (
                <button
                  className="wg-opt-icon"
                  title="Rasm yuklash"
                  onClick={async () => {
                    const u = await pickAndUploadImage();
                    if (u) setOptions(options.map((x, idx) => (idx === i ? { ...x, imageUrl: u } : x)));
                  }}
                >
                  <span className="material-symbols-outlined">image</span>
                </button>
              )}
              {hasCorrect && (
                <button
                  className={`wg-check ${o.isCorrect ? "on" : ""}`}
                  title="To'g'ri javob deb belgilash"
                  onClick={() => toggle(i)}
                >
                  <span className="material-symbols-outlined">check</span>
                </button>
              )}
            </div>
            {o.imageUrl && <img className="wg-opt-img" src={o.imageUrl} alt="" />}
            <textarea
              className="wg-opt-text"
              rows={2}
              value={o.text}
              placeholder="Javob variantini yozing"
              onChange={(e) => setOptions(options.map((x, idx) => (idx === i ? { ...x, text: e.target.value } : x)))}
            />
          </div>
        ))}
        {!fixed && options.length < 6 && (
          <button
            className="wg-add-opt"
            title="Variant qo'shish"
            onClick={() => setOptions([...options, { text: "", isCorrect: false }])}
          >
            <span className="material-symbols-outlined">add</span>
          </button>
        )}
      </div>
    );
  }

  if (type === "OPEN") {
    const answers = data.answers ?? [];
    return (
      <>
        <label>To'g'ri javob(lar)</label>
        {answers.map((a, i) => (
          <div className="row" key={i} style={{ marginBottom: 8 }}>
            <input
              style={{ marginBottom: 0 }}
              value={a}
              onChange={(e) => setData({ answers: answers.map((x, idx) => (idx === i ? e.target.value : x)) })}
            />
            <button className="btn btn-ghost" onClick={() => setData({ answers: answers.filter((_, idx) => idx !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button className="btn btn-ghost" onClick={() => setData({ answers: [...answers, ""] })}>
          + Javob varianti
        </button>
      </>
    );
  }

  if (type === "FILL_BLANK") {
    const blanks = data.blanks ?? [];
    return (
      <>
        <p className="muted" style={{ marginTop: 0 }}>
          Savol matnida har bir bo'sh joy uchun <code>___</code> (3 ta pastki chiziq) ishlating.
        </p>
        <label>Bo'sh joylar javoblari (vergul bilan bir nechta variant)</label>
        {blanks.map((b, i) => (
          <div className="row" key={i} style={{ marginBottom: 8 }}>
            <span className="badge">#{i + 1}</span>
            <input
              style={{ marginBottom: 0 }}
              value={b.join(", ")}
              onChange={(e) =>
                setData({
                  blanks: blanks.map((x, idx) =>
                    idx === i ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : x,
                  ),
                })
              }
              placeholder="javob, muqobil javob"
            />
            <button className="btn btn-ghost" onClick={() => setData({ blanks: blanks.filter((_, idx) => idx !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button className="btn btn-ghost" onClick={() => setData({ blanks: [...blanks, [""]] })}>
          + Bo'sh joy
        </button>
      </>
    );
  }

  if (type === "MATCH") {
    const pairs = data.pairs ?? [];
    return (
      <>
        <label>Juftliklar (chap ↔ o'ng)</label>
        {pairs.map((p, i) => (
          <div className="row" key={i} style={{ marginBottom: 8 }}>
            <input
              style={{ marginBottom: 0 }}
              value={p.left}
              onChange={(e) => setData({ pairs: pairs.map((x, idx) => (idx === i ? { ...x, left: e.target.value } : x)) })}
              placeholder="Chap"
            />
            <span>↔</span>
            <input
              style={{ marginBottom: 0 }}
              value={p.right}
              onChange={(e) => setData({ pairs: pairs.map((x, idx) => (idx === i ? { ...x, right: e.target.value } : x)) })}
              placeholder="O'ng"
            />
            <button className="btn btn-ghost" onClick={() => setData({ pairs: pairs.filter((_, idx) => idx !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button className="btn btn-ghost" onClick={() => setData({ pairs: [...pairs, { left: "", right: "" }] })}>
          + Juftlik
        </button>
      </>
    );
  }

  if (type === "REORDER") {
    const items = data.items ?? [];
    const swap = (i: number, j: number) => {
      if (j < 0 || j >= items.length) return;
      const copy = [...items];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      setData({ items: copy });
    };
    return (
      <>
        <label>To'g'ri tartibda kiriting (o'yinda aralashtiriladi)</label>
        {items.map((it, i) => (
          <div className="row" key={i} style={{ marginBottom: 8 }}>
            <span className="badge">{i + 1}</span>
            <input
              style={{ marginBottom: 0 }}
              value={it}
              onChange={(e) => setData({ items: items.map((x, idx) => (idx === i ? e.target.value : x)) })}
            />
            <button className="btn btn-ghost" onClick={() => swap(i, i - 1)}>▲</button>
            <button className="btn btn-ghost" onClick={() => swap(i, i + 1)}>▼</button>
            <button className="btn btn-ghost" onClick={() => setData({ items: items.filter((_, idx) => idx !== i) })}>✕</button>
          </div>
        ))}
        <button className="btn btn-ghost" onClick={() => setData({ items: [...items, ""] })}>
          + Element
        </button>
      </>
    );
  }

  return null;
}
