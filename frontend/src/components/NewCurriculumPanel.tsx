import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import QuizPicker from "./QuizPicker";
import type { QuizListItem } from "../types";

// YANGI o'quv dastur — O'quv dastur sahifasidagi to'rtinchi segment.
// Oylik modullar (1-oy ... 12-oy) bo'yicha guruhlangan, har modul yig'iladigan
// (collapsible). Shell'ni O'RAMAYDI — Curriculum sahifasi ichida render qilinadi.

interface LinkedQuiz {
  id: string;
  title: string;
  folderId: string | null;
  folder: { name: string } | null;
  _count: { slides: number };
}

interface NewLesson {
  id: string;
  module: string;
  order: number;
  title: string;
  author: string | null;
  quizId: string | null;
  quiz: LinkedQuiz | null;
}

interface EditState {
  module: string;
  title: string;
  author: string;
  quizId: string;
}

export default function NewCurriculumPanel() {
  const { teacher } = useAuth();
  const navigate = useNavigate();
  const isAdmin = teacher?.isAdmin === true;
  const canCreate = !!(teacher?.isAdmin || teacher?.canCreate);

  const [lessons, setLessons] = useState<NewLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [quizList, setQuizList] = useState<QuizListItem[]>([]);
  const [openModules, setOpenModules] = useState<Set<string>>(new Set());

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditState>({ module: "", title: "", author: "", quizId: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ lessons: NewLesson[] }>("/new-curriculum");
      setLessons(r.lessons);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!canCreate) return;
    api<{ quizzes: QuizListItem[] }>("/quizzes").then((r) => setQuizList(r.quizzes)).catch(() => {});
  }, [canCreate]);

  function toggleModule(m: string) {
    setOpenModules((s) => {
      const n = new Set(s);
      if (n.has(m)) n.delete(m); else n.add(m);
      return n;
    });
  }

  function openAddForm() {
    setForm({ module: "", title: "", author: "", quizId: "" });
    setShowAdd(true); setEditingId(null);
  }
  function openEdit(l: NewLesson) {
    setForm({ module: l.module, title: l.title, author: l.author ?? "", quizId: l.quizId ?? "" });
    setEditingId(l.id); setShowAdd(false);
  }

  async function save() {
    if (!form.module.trim() || !form.title.trim()) { showToast("Modul va dars nomini kiriting"); return; }
    setSaving(true);
    const body = JSON.stringify({
      module: form.module.trim(), title: form.title.trim(),
      author: form.author.trim() || null, quizId: form.quizId || null, order: 0,
    });
    try {
      if (editingId) await api(`/new-curriculum/${editingId}`, { method: "PUT", body });
      else await api("/new-curriculum", { method: "POST", body });
      await load();
      setShowAdd(false); setEditingId(null);
      showToast(editingId ? "✅ Saqlandi" : "✅ Qo'shildi");
    } catch (e) { showToast(e instanceof Error ? e.message : "Xatolik"); }
    finally { setSaving(false); }
  }

  async function removeLesson(l: NewLesson) {
    if (!confirm(`"${l.title}" darsini o'chirishni tasdiqlaysizmi?`)) return;
    try { await api(`/new-curriculum/${l.id}`, { method: "DELETE" }); await load(); }
    catch (e) { showToast(e instanceof Error ? e.message : "Xatolik"); }
  }

  async function attachQuiz(l: NewLesson, quizId: string) {
    try {
      await api(`/new-curriculum/${l.id}/quiz`, { method: "PATCH", body: JSON.stringify({ quizId: quizId || null }) });
      const q = quizList.find((x) => x.id === quizId);
      setLessons((ls) => ls.map((x) => (x.id === l.id
        ? { ...x, quizId: quizId || null, quiz: q ? { id: q.id, title: q.title, folderId: q.folderId ?? null, folder: null, _count: q._count } : null }
        : x)));
    } catch (e) { showToast(e instanceof Error ? e.message : "Xatolik"); }
  }

  // Modul bo'yicha guruhlash (birinchi ko'rinish tartibida)
  const q = query.trim().toLowerCase();
  const filtered = q
    ? lessons.filter((l) => l.title.toLowerCase().includes(q) || l.module.toLowerCase().includes(q))
    : lessons;
  const groups: { module: string; items: NewLesson[] }[] = [];
  const gmap = new Map<string, NewLesson[]>();
  for (const l of filtered) {
    if (!gmap.has(l.module)) { gmap.set(l.module, []); groups.push({ module: l.module, items: gmap.get(l.module)! }); }
    gmap.get(l.module)!.push(l);
  }
  const allModules = [...new Set(lessons.map((l) => l.module))];

  const withQuiz = lessons.filter((l) => l.quiz).length;
  const pct = lessons.length ? Math.round((withQuiz / lessons.length) * 100) : 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Yangi 12 oylik dastur: 1–6 oy dasturlash, 7–12 oy robototexnika
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Dars yoki modul qidirish…"
          style={{ minWidth: 200, padding: "9px 13px", borderRadius: 12, border: "2px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--ink)" }}
        />
      </div>

      {loading ? (
        <div><div className="cur-skel" /><div className="cur-skel" /><div className="cur-skel" /></div>
      ) : (
        <>
          {lessons.length > 0 && (
            <div className="cur-progress">
              <span style={{ whiteSpace: "nowrap" }}>📊 {withQuiz}/{lessons.length} darsga slayd biriktirilgan</span>
              <div className="bar"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
              <span className="muted" style={{ whiteSpace: "nowrap" }}>{pct}%</span>
            </div>
          )}

          {lessons.length === 0 && !showAdd && (
            <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 44, color: "var(--muted)", display: "block", marginBottom: 10 }}>auto_stories</span>
              <p className="muted" style={{ margin: 0 }}>Hali dars qo'shilmagan.{isAdmin && " Pastdagi tugma bilan qo'shing."}</p>
            </div>
          )}

          {groups.map((g) => {
            const open = q.length > 0 || openModules.has(g.module);
            const gWith = g.items.filter((l) => l.quiz).length;
            return (
              <div key={g.module} style={{ marginBottom: 10 }}>
                <button className="ncur-mod" onClick={() => toggleModule(g.module)} aria-expanded={open}>
                  <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                    {open ? "expand_more" : "chevron_right"}
                  </span>
                  <span style={{ flex: 1, textAlign: "left" }}>{g.module}</span>
                  <span className="ncur-mod-count">{gWith}/{g.items.length}</span>
                </button>

                {open && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8, marginLeft: 6 }}>
                    {g.items.map((l, i) => {
                      const hasQuiz = Boolean(l.quiz);
                      return (
                        <div key={l.id} className="cur-row" style={{ padding: "10px 14px" }}>
                          {hasQuiz ? (
                            <span className="material-symbols-outlined" title="Slayd biriktirilgan"
                              style={{ color: "var(--success)", fontSize: 20, flexShrink: 0 }}>task_alt</span>
                          ) : (
                            <span className="material-symbols-outlined" title="Slayd hali biriktirilmagan"
                              style={{ color: "var(--warn)", fontSize: 20, flexShrink: 0 }}>schedule</span>
                          )}
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontWeight: 600, fontSize: 14.5 }}>
                              {i + 1}. {l.title}
                            </div>
                            {l.quiz && (
                              <div className="muted" style={{ marginTop: 2, fontSize: 12.5 }}>
                                📑 {l.quiz.title} · {l.quiz._count.slides} ta slayd
                              </div>
                            )}
                          </div>
                          {l.author && (
                            <span className="muted text-sm" style={{ flexShrink: 0 }}>{l.author}</span>
                          )}
                          {hasQuiz && (
                            <>
                              <button className="cur-mini-btn view" onClick={() => navigate(`/activity/${l.quiz!.id}`)} title="Slaydlarni ko'rish">
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
                                Ko'rish
                              </button>
                              <button className="cur-mini-btn play" onClick={() => navigate(`/host/${l.quiz!.id}`)} title="O'yinni boshlash">
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                                Boshlash
                              </button>
                            </>
                          )}
                          {!hasQuiz && canCreate && (
                            <div className="cur-picker" style={{ flexShrink: 0, width: 200 }} title="Slayd biriktirish">
                              <QuizPicker quizzes={quizList} value={l.quizId ?? ""}
                                onChange={(id) => attachQuiz(l, id)} placeholder="Slayd biriktirish…" />
                            </div>
                          )}
                          {isAdmin && (
                            <>
                              <button className="cur-mini-btn edit" onClick={() => openEdit(l)} title="Tahrirlash">
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                              </button>
                              <button className="cur-mini-btn del" onClick={() => removeLesson(l)} title="O'chirish">
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {isAdmin && (showAdd || editingId) && (
            <div className="cur-form" style={{ marginTop: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>
                {editingId ? "✏️ Darsni tahrirlash" : "➕ Yangi dars qo'shish"}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label className="f-label">Modul (oy) *</label>
                  <input list="ncur-modules" value={form.module}
                    placeholder="Masalan: 1-oy: Kompyuter savodxonligi + AI"
                    onChange={(e) => setForm((f) => ({ ...f, module: e.target.value }))} />
                  <datalist id="ncur-modules">
                    {allModules.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </div>
                <div style={{ flex: 1.4, minWidth: 220 }}>
                  <label className="f-label">Dars nomi *</label>
                  <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && save()} />
                </div>
                <div style={{ width: 150 }}>
                  <label className="f-label">Muallif</label>
                  <input value={form.author} onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))} placeholder="Ixtiyoriy" />
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label className="f-label">Slayd biriktirish</label>
                  <QuizPicker quizzes={quizList} value={form.quizId} placeholder="— Ixtiyoriy —"
                    onChange={(id) => setForm((f) => ({ ...f, quizId: id }))} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" onClick={save} disabled={saving || !form.module.trim() || !form.title.trim()}>
                    {saving ? "…" : editingId ? "Saqlash" : "Qo'shish"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => { setShowAdd(false); setEditingId(null); }}>Bekor</button>
                </div>
              </div>
            </div>
          )}

          {isAdmin && !showAdd && !editingId && (
            <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={openAddForm}>+ Dars qo'shish</button>
          )}
        </>
      )}

      {toast && <div className="cur-toast">{toast}</div>}
    </div>
  );
}
