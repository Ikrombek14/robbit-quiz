import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import QuizPicker from "./QuizPicker";
import type { QuizListItem, FolderItem } from "../types";

// Qo'shimcha darslar — O'quv dastur sahifasidagi uchinchi (alohida) bo'lim.
// Yosh toifasi/yo'nalish/yilga bo'linmaydi: hammasi bitta UMUMIY ro'yxatda.
// Shell'ni O'RAMAYDI — Curriculum sahifasi ichida render qilinadi.

const TINTS: { bg: string; accent: string }[] = [
  { bg: "rgba(76, 141, 255, 0.09)", accent: "#4c8dff" },
  { bg: "rgba(34, 201, 147, 0.09)", accent: "#22c993" },
  { bg: "rgba(245, 166, 35, 0.10)", accent: "#f5a623" },
  { bg: "rgba(160, 108, 255, 0.09)", accent: "#a06cff" },
  { bg: "rgba(255, 107, 138, 0.09)", accent: "#ff6b8a" },
  { bg: "rgba(43, 184, 214, 0.10)", accent: "#2bb8d6" },
];

function cleanTitle(raw: string): string {
  const t = String(raw ?? "").trim();
  const stripped = t.replace(/^\s*\d+\s*[-.)]?\s*(dars\s*[.:]?)?\s*/i, "").trim();
  return stripped || t;
}

interface LinkedQuiz {
  id: string;
  title: string;
  folderId: string | null;
  folder: { name: string } | null;
  _count: { slides: number };
}

interface ExtraLesson {
  id: string;
  order: number;
  title: string;
  description: string | null;
  author: string | null;
  quizId: string | null;
  quiz: LinkedQuiz | null;
}

interface EditState {
  title: string;
  description: string;
  author: string;
  quizId: string;
  order: number;
}

export default function ExtraLessonsPanel() {
  const { teacher } = useAuth();
  const navigate = useNavigate();
  const isAdmin = teacher?.isAdmin === true;
  const canCreate = !!(teacher?.isAdmin || teacher?.canCreate);

  const [lessons, setLessons] = useState<ExtraLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [quizList, setQuizList] = useState<QuizListItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newQuizId, setNewQuizId] = useState("");
  const [newOrder, setNewOrder] = useState(1);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const [showFolderAdd, setShowFolderAdd] = useState(false);
  const [folderPickId, setFolderPickId] = useState("");
  const [stripPrefix, setStripPrefix] = useState(true);

  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ title: "", description: "", author: "", quizId: "", order: 0 });
  const [editSaving, setEditSaving] = useState(false);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  function toggleSelect(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ lessons: ExtraLesson[] }>("/extra-lessons");
      setLessons(r.lessons);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!canCreate) return;
    api<{ quizzes: QuizListItem[] }>("/quizzes").then((r) => setQuizList(r.quizzes)).catch(() => {});
  }, [canCreate]);

  useEffect(() => {
    if (!isAdmin) return;
    api<{ folders: FolderItem[] }>("/folders").then((r) => setFolders(r.folders.filter((f) => f.mine))).catch(() => {});
  }, [isAdmin]);

  function quizForId(id: string): LinkedQuiz | null {
    const q = quizList.find((q) => q.id === id);
    if (!q) return null;
    const fid = q.folderId ?? null;
    const fname = fid ? (folders.find((f) => f.id === fid)?.name ?? null) : null;
    return { id: q.id, title: q.title, folderId: fid, folder: fname ? { name: fname } : null, _count: q._count };
  }

  function openAdd() {
    setNewOrder(lessons.length + 1);
    setNewTitle(""); setNewDesc(""); setNewAuthor(""); setNewQuizId("");
    setShowAdd(true); setShowFolderAdd(false); setShowBulkAdd(false); setEditingId(null);
  }
  function openFolderAdd() {
    setFolderPickId(""); setStripPrefix(true);
    setShowFolderAdd(true); setShowAdd(false); setShowBulkAdd(false); setEditingId(null);
  }
  function openBulkAdd() {
    setBulkText("");
    setShowBulkAdd(true); setShowAdd(false); setShowFolderAdd(false); setEditingId(null);
  }
  function openEdit(l: ExtraLesson) {
    setEditingId(l.id);
    setEditState({
      title: l.title, description: l.description ?? "", author: l.author ?? "",
      quizId: l.quizId ?? "", order: l.order + 1,
    });
    setShowAdd(false); setShowFolderAdd(false); setShowBulkAdd(false);
  }

  async function addLesson() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      await api("/extra-lessons", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim() || null,
          author: newAuthor.trim() || null,
          quizId: newQuizId || null,
          order: newOrder - 1,
        }),
      });
      await load();
      setNewTitle(""); setNewDesc(""); setNewAuthor(""); setNewQuizId("");
      setNewOrder((o) => o + 1);
      titleRef.current?.focus();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Xatolik");
    } finally { setSaving(false); }
  }

  async function addFromFolder() {
    if (!folderPickId) return;
    setSaving(true);
    try {
      const r = await api<{ created: number; skipped: number }>("/extra-lessons/from-folder", {
        method: "POST",
        body: JSON.stringify({ folderId: folderPickId, stripPrefix }),
      });
      await load();
      setShowFolderAdd(false);
      showToast(`✅ ${r.created} ta dars qo'shildi${r.skipped ? `, ${r.skipped} ta allaqachon bor edi` : ""}.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Xatolik");
    } finally { setSaving(false); }
  }

  async function addBulkTitles() {
    const titles = bulkText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (titles.length === 0) return;
    setSaving(true);
    try {
      const r = await api<{ created: number }>("/extra-lessons/bulk-titles", {
        method: "POST",
        body: JSON.stringify({ titles }),
      });
      await load();
      setShowBulkAdd(false); setBulkText("");
      showToast(`✅ ${r.created} ta dars qo'shildi.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Xatolik");
    } finally { setSaving(false); }
  }

  async function saveEdit(l: ExtraLesson) {
    if (!editState.title.trim()) return;
    setEditSaving(true);
    try {
      await api(`/extra-lessons/${l.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: editState.title.trim(),
          description: editState.description.trim() || null,
          author: editState.author.trim() || null,
          quizId: editState.quizId || null,
          order: editState.order - 1,
        }),
      });
      await load();
      setEditingId(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Xatolik");
    } finally { setEditSaving(false); }
  }

  async function removeLesson(id: string) {
    if (!confirm("Qo'shimcha darsni o'chirishni tasdiqlaysizmi?")) return;
    await api(`/extra-lessons/${id}`, { method: "DELETE" });
    await load();
  }

  async function removeSelected() {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} ta darsni o'chirishni tasdiqlaysizmi?`)) return;
    try {
      const r = await api<{ deleted: number }>("/extra-lessons/bulk-delete", {
        method: "POST",
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      await load();
      exitSelectMode();
      showToast(`🗑️ ${r.deleted} ta dars o'chirildi.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function dropOn(targetId: string) {
    const from = lessons.findIndex((l) => l.id === dragId);
    const to = lessons.findIndex((l) => l.id === targetId);
    setDragId(null);
    setDragOverId(null);
    if (from < 0 || to < 0 || from === to) return;
    const prev = lessons;
    const next = [...lessons];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const reIndexed = next.map((l, i) => ({ ...l, order: i }));
    setLessons(reIndexed);
    try {
      await api("/extra-lessons/reorder", { method: "PATCH", body: JSON.stringify({ ids: reIndexed.map((l) => l.id) }) });
    } catch {
      setLessons(prev);
    }
  }

  async function attachQuiz(l: ExtraLesson, quizId: string) {
    await api(`/extra-lessons/${l.id}/quiz`, { method: "PATCH", body: JSON.stringify({ quizId: quizId || null }) });
    setLessons((ls) =>
      ls.map((x) => (x.id === l.id ? { ...x, quizId: quizId || null, quiz: quizId ? quizForId(quizId) : null } : x)),
    );
  }

  const q = query.trim().toLowerCase();
  const shown = q
    ? lessons.filter((l) =>
        l.title.toLowerCase().includes(q) ||
        (l.description ?? "").toLowerCase().includes(q) ||
        (l.author ?? "").toLowerCase().includes(q))
    : lessons;
  const searching = q.length > 0;

  const withQuizCount = lessons.filter((l) => l.quiz).length;
  const progressPct = lessons.length > 0 ? Math.round((withQuizCount / lessons.length) * 100) : 0;

  const folderOrder = new Map<string, number>();
  for (const l of lessons) {
    const fid = l.quiz?.folderId;
    if (fid && !folderOrder.has(fid)) folderOrder.set(fid, folderOrder.size);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          O'quv rejadan tashqari qo'shimcha darslar — umumiy ro'yxat
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Qo'shimcha dars qidirish…"
          style={{ minWidth: 200, padding: "9px 13px", borderRadius: 12, border: "2px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--ink)" }}
        />
      </div>

      {loading ? (
        <div>
          <div className="cur-skel" />
          <div className="cur-skel" />
          <div className="cur-skel" />
        </div>
      ) : (
        <div>
          {lessons.length === 0 && !showAdd && !showFolderAdd && !showBulkAdd && (
            <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 44, color: "var(--muted)", display: "block", marginBottom: 10 }}>library_add</span>
              <p className="muted" style={{ margin: 0 }}>
                Hali qo'shimcha dars qo'shilmagan.
                {isAdmin && " Pastdagi tugmalar bilan qo'shing."}
              </p>
            </div>
          )}

          {lessons.length > 0 && (
            <div className="cur-progress">
              <span style={{ whiteSpace: "nowrap" }}>
                📊 {withQuizCount}/{lessons.length} darsga slayd biriktirilgan
              </span>
              <div className="bar"><div className="bar-fill" style={{ width: `${progressPct}%` }} /></div>
              <span className="muted" style={{ whiteSpace: "nowrap" }}>{progressPct}%</span>
              {isAdmin && !selectMode && (
                <button className="cur-mini-btn edit" style={{ marginLeft: "auto" }}
                  onClick={() => setSelectMode(true)} title="Bir nechtasini belgilab o'chirish">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>checklist</span>
                  Belgilash
                </button>
              )}
            </div>
          )}

          {isAdmin && selectMode && (
            <div className="cur-select-bar">
              <span style={{ fontWeight: 700 }}>{selectedIds.size} ta tanlandi</span>
              <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}
                onClick={() => setSelectedIds(selectedIds.size === shown.length ? new Set() : new Set(shown.map((l) => l.id)))}>
                {selectedIds.size === shown.length ? "Bekor qilish" : "Hammasini tanlash"}
              </button>
              <div style={{ flex: 1 }} />
              <button className="cur-mini-btn del" onClick={removeSelected} disabled={selectedIds.size === 0}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                O'chirish ({selectedIds.size})
              </button>
              <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={exitSelectMode}>Yopish</button>
            </div>
          )}

          {searching && (
            <p className="muted" style={{ fontSize: 13, margin: "0 0 8px" }}>
              {shown.length} ta topildi — qidiruv paytida tartibni o'zgartirib bo'lmaydi
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {shown.map((l) => {
              const hasQuiz = Boolean(l.quiz);
              const isEditing = editingId === l.id;
              const folderId = l.quiz?.folderId ?? null;
              const tint = folderId ? TINTS[(folderOrder.get(folderId) ?? 0) % TINTS.length] : null;
              const canDrag = isAdmin && !selectMode && !searching;

              if (isEditing && isAdmin) {
                return (
                  <div key={l.id} className="cur-form editing" style={{ marginTop: 0 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div style={{ width: 72 }}>
                        <label className="f-label">#</label>
                        <input type="number" min={1} value={editState.order}
                          onChange={(e) => setEditState((s) => ({ ...s, order: Number(e.target.value) }))}
                          style={{ textAlign: "center" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <label className="f-label">Dars nomi *</label>
                        <input value={editState.title} autoFocus
                          onChange={(e) => setEditState((s) => ({ ...s, title: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit(l)} />
                      </div>
                      <div style={{ width: 150 }}>
                        <label className="f-label">Muallif</label>
                        <input value={editState.author}
                          onChange={(e) => setEditState((s) => ({ ...s, author: e.target.value }))}
                          placeholder="Ixtiyoriy" />
                      </div>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <label className="f-label">Slayd biriktirish</label>
                        <QuizPicker quizzes={quizList} value={editState.quizId}
                          onChange={(id) => setEditState((s) => ({ ...s, quizId: id }))} />
                      </div>
                      <div style={{ flex: 1, minWidth: 220 }}>
                        <label className="f-label">Izoh</label>
                        <input value={editState.description}
                          onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                          placeholder="Ixtiyoriy" />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn" onClick={() => saveEdit(l)} disabled={editSaving || !editState.title.trim()}>
                          {editSaving ? "…" : "Saqlash"}
                        </button>
                        <button className="btn btn-ghost" onClick={() => setEditingId(null)}>Bekor</button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={l.id} id={`extra-${l.id}`}
                  draggable={canDrag}
                  onDragStart={canDrag ? () => setDragId(l.id) : undefined}
                  onDragEnd={canDrag ? () => { setDragId(null); setDragOverId(null); } : undefined}
                  onDragOver={canDrag ? (e) => { e.preventDefault(); if (dragId && dragId !== l.id) setDragOverId(l.id); } : undefined}
                  onDragLeave={canDrag ? () => setDragOverId((cur) => (cur === l.id ? null : cur)) : undefined}
                  onDrop={canDrag ? (e) => { e.preventDefault(); dropOn(l.id); } : undefined}
                  className={`cur-row ${dragOverId === l.id ? "drag-over" : ""} ${dragId === l.id ? "dragging" : ""} ${selectMode && selectedIds.has(l.id) ? "selected" : ""}`}
                  onClick={selectMode ? () => toggleSelect(l.id) : undefined}
                  style={{
                    ...(tint ? { ["--row-tint" as string]: tint.bg, ["--row-accent" as string]: tint.accent } : {}),
                    ...(selectMode ? { cursor: "pointer" } : {}),
                  }}
                >
                  {isAdmin && selectMode && (
                    <input type="checkbox" checked={selectedIds.has(l.id)} readOnly
                      style={{ width: 18, height: 18, flexShrink: 0, cursor: "pointer" }} />
                  )}
                  {canDrag && (
                    <span className="material-symbols-outlined" title="Sudrab tartibini o'zgartiring"
                      style={{ color: "var(--muted)", fontSize: 20, cursor: "grab", flexShrink: 0 }}>drag_indicator</span>
                  )}
                  {hasQuiz ? (
                    <span className="material-symbols-outlined" title="Slayd biriktirilgan"
                      style={{ color: "var(--success)", fontSize: 22, flexShrink: 0 }}>task_alt</span>
                  ) : (
                    <span className="material-symbols-outlined" title="Slayd hali biriktirilmagan"
                      style={{ color: "var(--warn)", fontSize: 22, flexShrink: 0 }}>schedule</span>
                  )}

                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div
                      style={{
                        fontWeight: 600, fontSize: 15,
                        cursor: isAdmin && hasQuiz ? "pointer" : "default",
                        color: isAdmin && hasQuiz ? "var(--primary)" : undefined,
                      }}
                      onClick={(e) => { if (selectMode) return; if (isAdmin && hasQuiz) { e.stopPropagation(); navigate(`/quiz/${l.quiz!.id}`); } }}
                      title={isAdmin && hasQuiz ? "Slaydni tahrirlash" : undefined}
                    >
                      {l.order + 1}. {l.title}
                      {isAdmin && hasQuiz && (
                        <span className="material-symbols-outlined" style={{ fontSize: 15, marginLeft: 5, verticalAlign: "middle", opacity: 0.7 }}>edit_note</span>
                      )}
                    </div>
                    {l.description && (
                      <div className="muted" style={{ marginTop: 3, fontSize: 13 }}>{l.description}</div>
                    )}
                    {l.quiz && (
                      <div style={{ marginTop: 3, fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>
                          📑 {cleanTitle(l.quiz.title).toLowerCase() === cleanTitle(l.title).toLowerCase()
                            ? `${l.quiz._count.slides} ta slayd`
                            : `${l.quiz.title} · ${l.quiz._count.slides} ta slayd`}
                        </span>
                        {l.quiz.folder && tint && (
                          <span title={`Papka: ${l.quiz.folder.name}`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700,
                              padding: "1px 8px", borderRadius: 999, whiteSpace: "nowrap",
                              background: tint.bg, color: tint.accent, border: `1px solid ${tint.accent}`,
                            }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: tint.accent }} />
                            {l.quiz.folder.name}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {l.author && (
                    <span className="muted text-sm" style={{ flexShrink: 0 }}>
                      Muallif: <strong>{l.author}</strong>
                    </span>
                  )}

                  {hasQuiz && !selectMode && (
                    <>
                      <button className="cur-mini-btn view" onClick={() => navigate(`/activity/${l.quiz!.id}`)}
                        title="Slaydlarni oldindan ko'rish">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
                        Ko'rish
                      </button>
                      <button className="cur-mini-btn play" onClick={() => navigate(`/host/${l.quiz!.id}`)}
                        title="O'yinni boshlash">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                        Boshlash
                      </button>
                    </>
                  )}

                  {!isAdmin && canCreate && !selectMode && (
                    <div className="cur-picker" style={{ flexShrink: 0, width: 200 }} title="O'z slaydingizni biriktirish">
                      <QuizPicker quizzes={quizList} value={l.quizId ?? ""}
                        onChange={(id) => attachQuiz(l, id)} placeholder="Slayd biriktirish…" />
                    </div>
                  )}

                  {isAdmin && !selectMode && (
                    <>
                      <button className="cur-mini-btn edit" onClick={() => openEdit(l)} title="Tahrirlash">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                      </button>
                      <button className="cur-mini-btn del" onClick={() => removeLesson(l.id)} title="O'chirish">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {isAdmin && (
            <>
              {showAdd && (
                <div className="cur-form">
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ width: 72 }}>
                      <label className="f-label">#</label>
                      <input type="number" min={1} value={newOrder}
                        onChange={(e) => setNewOrder(Number(e.target.value))} style={{ textAlign: "center" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label className="f-label">Dars nomi *</label>
                      <input ref={titleRef} value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Masalan: Scratch bilan qo'shimcha mashg'ulot"
                        autoFocus onKeyDown={(e) => e.key === "Enter" && addLesson()} />
                    </div>
                    <div style={{ width: 160 }}>
                      <label className="f-label">Muallif</label>
                      <input value={newAuthor} onChange={(e) => setNewAuthor(e.target.value)} placeholder="Ixtiyoriy" />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <label className="f-label">Slayd biriktirish</label>
                      <QuizPicker quizzes={quizList} value={newQuizId} placeholder="— Ixtiyoriy —"
                        onChange={(id) => {
                          setNewQuizId(id);
                          if (id && !newTitle.trim()) {
                            const qz = quizList.find((x) => x.id === id);
                            if (qz) setNewTitle(cleanTitle(qz.title));
                          }
                        }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <label className="f-label">Izoh</label>
                      <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Ixtiyoriy" />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn" onClick={addLesson} disabled={saving || !newTitle.trim()}>
                        {saving ? "Saqlanmoqda…" : "Qo'shish"}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Yopish</button>
                    </div>
                  </div>
                </div>
              )}

              {showFolderAdd && (
                <div className="cur-form">
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>📁 Papkadan qo'shimcha darslar yaratish</div>
                  <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                    Tanlangan papkadagi <b>har quizdan bitta dars</b> yaratiladi (slayd biriktirilgan holda).
                    Allaqachon qo'shilgan quizlar o'tkazib yuboriladi.
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <select value={folderPickId} onChange={(e) => setFolderPickId(e.target.value)}
                      style={{ flex: 1, minWidth: 240, padding: "8px 12px", borderRadius: 8, border: "2px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--ink)" }}>
                      <option value="">— Papkani tanlang —</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>📁 {f.name} ({f.count})</option>
                      ))}
                    </select>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
                      <input type="checkbox" checked={stripPrefix} onChange={(e) => setStripPrefix(e.target.checked)} />
                      Boshidagi raqamni olib tashlash
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn" onClick={addFromFolder} disabled={saving || !folderPickId}>
                        {saving ? "Yaratilmoqda…" : "Yaratish"}
                      </button>
                      <button className="btn btn-ghost" onClick={() => setShowFolderAdd(false)}>Bekor</button>
                    </div>
                  </div>
                </div>
              )}

              {showBulkAdd && (
                <div className="cur-form">
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 Ro'yxatdan qo'shimcha darslar qo'shish</div>
                  <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                    Har qatorga bitta dars nomi. Slaydni keyinroq biriktirasiz.
                  </p>
                  <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={8}
                    placeholder={"Scratch bilan o'yin yasash\nMikrobit bilan tanishuv\nQo'shimcha algoritmlar"}
                    style={{ fontSize: 14, width: "100%" }} />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {bulkText.split("\n").map((s) => s.trim()).filter(Boolean).length} ta nom
                    </span>
                    <div style={{ flex: 1 }} />
                    <button className="btn" onClick={addBulkTitles} disabled={saving || !bulkText.trim()}>
                      {saving ? "Qo'shilmoqda…" : "Qo'shish"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => { setShowBulkAdd(false); setBulkText(""); }}>Bekor</button>
                  </div>
                </div>
              )}

              {!showAdd && !showFolderAdd && !showBulkAdd && (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <button className="btn btn-ghost" onClick={openAdd}>+ Dars qo'shish</button>
                  <button className="btn btn-ghost" onClick={openFolderAdd}>📁 Papkadan qo'shish</button>
                  <button className="btn btn-ghost" onClick={openBulkAdd}>📋 Ro'yxatdan qo'shish</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {toast && <div className="cur-toast">{toast}</div>}
    </div>
  );
}
