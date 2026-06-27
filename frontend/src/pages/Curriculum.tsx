import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import SearchBar, { type LessonHit } from "../components/SearchBar";
import type { QuizListItem } from "../types";

type Subject = "ROBOTEXNIKA" | "DASTURLASH";
type AgeGroup = "MIDDLE" | "SENIOR";

interface LinkedQuiz {
  id: string;
  title: string;
  _count: { slides: number };
}

interface LessonPlan {
  id: string;
  subject: Subject;
  ageGroup: AgeGroup;
  year: number;
  section: string | null;
  order: number;
  title: string;
  author: string | null;
  isDemo: boolean;
  quizId: string | null;
  quiz: LinkedQuiz | null;
}

const AGE_GROUPS: { key: AgeGroup; label: string }[] = [
  { key: "MIDDLE", label: "Middle (9–11 yosh)" },
  { key: "SENIOR", label: "Senior (12–15 yosh)" },
];

const SECTIONS = [
  { key: "DESIGN", label: "Design" },
  { key: "PROGRAMMING", label: "Programming" },
  { key: "ROBOTICS", label: "Robotics" },
];

interface EditState {
  title: string;
  author: string;
  isDemo: boolean;
  quizId: string;
  order: number;
}

export default function Curriculum() {
  const { teacher } = useAuth();
  const navigate = useNavigate();
  const isAdmin = teacher?.isAdmin === true;

  const [subject, setSubject] = useState<Subject>("ROBOTEXNIKA");
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [section, setSection] = useState<string>("DESIGN");
  const [lessons, setLessons] = useState<LessonPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const [quizList, setQuizList] = useState<QuizListItem[]>([]);

  // Qo'shish
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAuthor, setNewAuthor] = useState("");
  const [newIsDemo, setNewIsDemo] = useState(false);
  const [newQuizId, setNewQuizId] = useState<string>("");
  const [newOrder, setNewOrder] = useState<number>(1);
  const [saving, setSaving] = useState(false);

  // Tahrirlash
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ title: "", author: "", isDemo: false, quizId: "", order: 0 });
  const [editSaving, setEditSaving] = useState(false);

  const allFiltersSet = ageGroup !== null && year !== null;

  // Qidiruvdan dars tanlanganda — filtrlarni o'rnatib, darsni belgilash uchun id saqlaymiz
  function pickLesson(l: LessonHit) {
    setSubject(l.subject);
    setAgeGroup(l.ageGroup);
    setYear(l.year);
    setSection(l.section ?? "DESIGN");
    setShowAdd(false);
    setEditingId(null);
    setHighlightId(l.id);
  }

  // Topilgan darsni ko'rinishga keltirib, qisqa belgilab qo'yamiz
  useEffect(() => {
    if (!highlightId || lessons.length === 0) return;
    if (!lessons.some((l) => l.id === highlightId)) return;
    const el = document.getElementById(`lesson-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.transition = "box-shadow 0.3s";
      el.style.boxShadow = "0 0 0 3px var(--primary)";
      setTimeout(() => { el.style.boxShadow = ""; }, 1600);
    }
    setHighlightId(null);
  }, [lessons, highlightId]);

  useEffect(() => {
    if (!isAdmin) return;
    api<{ quizzes: QuizListItem[] }>("/quizzes")
      .then((r) => setQuizList(r.quizzes))
      .catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    if (!allFiltersSet) { setLessons([]); return; }
    setLoading(true);
    const params = new URLSearchParams({ subject, ageGroup: ageGroup!, year: String(year) });
    if (subject === "ROBOTEXNIKA") params.set("section", section);
    api<{ lessons: LessonPlan[] }>(`/curriculum?${params}`)
      .then((r) => setLessons(r.lessons))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subject, ageGroup, year, section, allFiltersSet]);

  function changeSubject(s: Subject) {
    setSubject(s); setAgeGroup(null); setYear(null); setSection("DESIGN");
    setShowAdd(false); setEditingId(null);
  }
  function changeAgeGroup(ag: AgeGroup) {
    setAgeGroup(ag); setYear(null); setShowAdd(false); setEditingId(null);
  }

  function openAdd() {
    setNewOrder(lessons.length + 1);
    setNewTitle(""); setNewAuthor(""); setNewIsDemo(false); setNewQuizId("");
    setShowAdd(true); setEditingId(null);
  }

  function openEdit(l: LessonPlan) {
    setEditingId(l.id);
    setEditState({ title: l.title, author: l.author ?? "", isDemo: l.isDemo, quizId: l.quizId ?? "", order: l.order + 1 });
    setShowAdd(false);
  }

  function quizForId(id: string): LinkedQuiz | null {
    const q = quizList.find((q) => q.id === id);
    return q ? { id: q.id, title: q.title, _count: q._count } : null;
  }

  async function addLesson() {
    if (!newTitle.trim() || !allFiltersSet) return;
    setSaving(true);
    try {
      const body = {
        subject, ageGroup, year,
        section: subject === "ROBOTEXNIKA" ? section : null,
        order: newOrder - 1,
        title: newTitle.trim(),
        author: newAuthor.trim() || null,
        isDemo: newIsDemo,
        quizId: newQuizId || null,
      };
      const r = await api<{ lesson: LessonPlan }>("/curriculum", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const lesson = { ...r.lesson, quiz: newQuizId ? quizForId(newQuizId) : null };
      setLessons((ls) => [...ls, lesson].sort((a, b) => a.order - b.order));
      setShowAdd(false);
    } finally { setSaving(false); }
  }

  async function saveEdit(l: LessonPlan) {
    if (!editState.title.trim()) return;
    setEditSaving(true);
    try {
      const body = {
        subject: l.subject, ageGroup: l.ageGroup, year: l.year, section: l.section,
        order: editState.order - 1,
        title: editState.title.trim(),
        author: editState.author.trim() || null,
        isDemo: editState.isDemo,
        quizId: editState.quizId || null,
      };
      await api(`/curriculum/${l.id}`, { method: "PUT", body: JSON.stringify(body) });
      setLessons((ls) =>
        ls.map((x) =>
          x.id === l.id
            ? { ...x, ...body, order: body.order, quiz: editState.quizId ? quizForId(editState.quizId) : null }
            : x
        ).sort((a, b) => a.order - b.order)
      );
      setEditingId(null);
    } finally { setEditSaving(false); }
  }

  async function removeLesson(id: string) {
    if (!confirm("Darsni o'chirishni tasdiqlaysizmi?")) return;
    await api(`/curriculum/${id}`, { method: "DELETE" });
    setLessons((ls) => ls.filter((l) => l.id !== id));
  }

  const btnBase: React.CSSProperties = {
    border: "none", cursor: "pointer", borderRadius: 8,
    display: "flex", alignItems: "center", gap: 4,
    padding: "4px 8px", fontSize: 13, fontWeight: 600,
  };

  return (
    <Shell>
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>O'quv dastur</h1>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            Yosh toifasi va yo'nalish bo'yicha dars rejalar
          </p>
        </div>
        <SearchBar scope="lessons" onPick={(item) => pickLesson(item as LessonHit)} placeholder="Dars qidirish…" />
      </div>

      {/* Subject toggle */}
      <div style={{ display: "inline-flex", background: "var(--surface-high)", borderRadius: 999, padding: 4, gap: 4, marginBottom: 28 }}>
        {(["ROBOTEXNIKA", "DASTURLASH"] as Subject[]).map((s) => (
          <button key={s} onClick={() => changeSubject(s)} style={{
            padding: "8px 28px", borderRadius: 999, border: "none", cursor: "pointer",
            fontWeight: 700, fontSize: 15,
            background: subject === s ? "var(--primary)" : "transparent",
            color: subject === s ? "#fff" : "var(--ink)", transition: "all 0.15s",
          }}>
            {s === "ROBOTEXNIKA" ? "Robotexnika" : "Dasturlash"}
          </button>
        ))}
      </div>

      {/* Yosh toifasi */}
      <div style={{ marginBottom: 16 }}>
        <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Yosh toifasi</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {AGE_GROUPS.map((ag) => (
            <button key={ag.key} onClick={() => changeAgeGroup(ag.key)} style={{
              padding: "8px 20px", borderRadius: 10, border: "2px solid",
              borderColor: ageGroup === ag.key ? "var(--primary)" : "var(--border)",
              background: ageGroup === ag.key ? "var(--primary-soft)" : "transparent",
              color: ageGroup === ag.key ? "var(--primary)" : "var(--ink)",
              fontWeight: 600, cursor: "pointer", fontSize: 14, transition: "all 0.15s",
            }}>{ag.label}</button>
          ))}
        </div>
      </div>

      {/* O'quv yili */}
      {ageGroup && (
        <div style={{ marginBottom: 28 }}>
          <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>O'quv yili</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 2].map((y) => (
              <button key={y} onClick={() => setYear(y)} style={{
                padding: "8px 28px", borderRadius: 10, border: "2px solid",
                borderColor: year === y ? "var(--c2)" : "var(--border)",
                background: year === y ? "#e8fff0" : "transparent",
                color: year === y ? "var(--c2)" : "var(--ink)",
                fontWeight: 600, cursor: "pointer", fontSize: 14, transition: "all 0.15s",
              }}>{y}-yil</button>
            ))}
          </div>
        </div>
      )}

      {/* Section tablar */}
      {subject === "ROBOTEXNIKA" && allFiltersSet && (
        <div style={{ display: "flex", borderBottom: "2px solid var(--border)", marginBottom: 20 }}>
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => setSection(s.key)} style={{
              padding: "10px 24px", border: "none", background: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 15,
              color: section === s.key ? "var(--primary)" : "var(--muted)",
              borderBottom: section === s.key ? "2px solid var(--primary)" : "2px solid transparent",
              marginBottom: -2, transition: "all 0.15s",
            }}>{s.label}</button>
          ))}
        </div>
      )}

      {/* Kontent */}
      {!allFiltersSet ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 24px", marginTop: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--muted)", display: "block", marginBottom: 12 }}>menu_book</span>
          <p className="muted" style={{ margin: 0, fontSize: 16 }}>{!ageGroup ? "Yosh toifasini tanlang" : "O'quv yilini tanlang"}</p>
        </div>
      ) : loading ? (
        <p className="muted" style={{ marginTop: 16 }}>Yuklanmoqda…</p>
      ) : (
        <div>
          {lessons.length === 0 && !showAdd && (
            <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
              <p className="muted" style={{ margin: 0 }}>Bu bo'lim uchun hali dars qo'shilmagan.</p>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lessons.map((l) => {
              const hasQuiz = Boolean(l.quiz);
              const isEditing = editingId === l.id;

              if (isEditing && isAdmin) {
                // ---- EDIT REJIMI ----
                return (
                  <div key={l.id} style={{
                    padding: 16, background: "var(--surface-low)", borderRadius: 12,
                    border: "2px solid var(--primary)",
                  }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                      {/* Tartib raqami */}
                      <div style={{ width: 72 }}>
                        <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>#</label>
                        <input type="number" min={1} value={editState.order}
                          onChange={(e) => setEditState((s) => ({ ...s, order: Number(e.target.value) }))}
                          style={{ textAlign: "center" }}
                        />
                      </div>
                      {/* Mavzu */}
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>Dars mavzusi *</label>
                        <input value={editState.title} autoFocus
                          onChange={(e) => setEditState((s) => ({ ...s, title: e.target.value }))}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit(l)}
                        />
                      </div>
                      {/* Muallif */}
                      <div style={{ width: 150 }}>
                        <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>Muallif</label>
                        <input value={editState.author}
                          onChange={(e) => setEditState((s) => ({ ...s, author: e.target.value }))}
                          placeholder="Ixtiyoriy"
                        />
                      </div>
                      {/* Quiz */}
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>Slayd biriktirish</label>
                        <select value={editState.quizId}
                          onChange={(e) => setEditState((s) => ({ ...s, quizId: e.target.value }))}
                          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "2px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--ink)" }}
                        >
                          <option value="">— Biriktirilmagan —</option>
                          {quizList.map((q) => (
                            <option key={q.id} value={q.id}>{q.title} ({q._count.slides} slayd)</option>
                          ))}
                        </select>
                      </div>
                      {/* Demo Day */}
                      <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 10, cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
                        <input type="checkbox" checked={editState.isDemo}
                          onChange={(e) => setEditState((s) => ({ ...s, isDemo: e.target.checked }))} />
                        Demo Day
                      </label>
                      {/* Tugmalar */}
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

              // ---- KO'RISH REJIMI ----
              return (
                <div key={l.id} id={`lesson-${l.id}`} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  background: "var(--surface-low)", borderRadius: 12, border: "1px solid var(--border)",
                }}>
                  {/* Holat belgisi */}
                  {hasQuiz ? (
                    <span className="material-symbols-outlined" style={{ color: "#22c55e", fontSize: 22, flexShrink: 0 }}>task_alt</span>
                  ) : (
                    <span className="material-symbols-outlined" style={{ color: "#f59e0b", fontSize: 22, flexShrink: 0 }}>schedule</span>
                  )}

                  {/* Mavzu va biriktirilgan quiz */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>
                      {l.order + 1}. {l.title}
                      {l.isDemo && (
                        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#22c55e", marginLeft: 8, verticalAlign: "middle" }} />
                      )}
                    </div>
                    {l.quiz && (
                      <div style={{ marginTop: 3, fontSize: 13, color: "var(--muted)" }}>
                        📑 {l.quiz.title} · {l.quiz._count.slides} ta slayd
                      </div>
                    )}
                  </div>

                  {l.author && (
                    <span className="muted text-sm" style={{ flexShrink: 0 }}>
                      Muallif: <strong>{l.author}</strong>
                    </span>
                  )}

                  {/* Boshlash tugmasi — faqat quiz biriktirilganda */}
                  {hasQuiz && (
                    <button
                      onClick={() => navigate(`/host/${l.quiz!.id}`)}
                      style={{ ...btnBase, background: "#22c55e", color: "#fff", padding: "6px 14px", flexShrink: 0 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                      Boshlash
                    </button>
                  )}

                  {/* Admin tugmalari */}
                  {isAdmin && (
                    <>
                      <button onClick={() => openEdit(l)} title="Tahrirlash"
                        style={{ ...btnBase, background: "var(--primary-soft)", color: "var(--primary)", flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                      </button>
                      <button onClick={() => removeLesson(l.id)} title="O'chirish"
                        style={{ ...btnBase, background: "var(--error-container)", color: "var(--error)", flexShrink: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Admin — qo'shish formasi */}
          {isAdmin && (
            showAdd ? (
              <div style={{ marginTop: 12, padding: 16, background: "var(--surface-low)", borderRadius: 12, border: "2px dashed var(--border)" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                  {/* Tartib raqami */}
                  <div style={{ width: 72 }}>
                    <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>#</label>
                    <input type="number" min={1} value={newOrder}
                      onChange={(e) => setNewOrder(Number(e.target.value))}
                      style={{ textAlign: "center" }}
                    />
                  </div>
                  {/* Mavzu */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>Dars mavzusi *</label>
                    <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Masalan: Google Docs bilan ishlash"
                      autoFocus onKeyDown={(e) => e.key === "Enter" && addLesson()}
                    />
                  </div>
                  {/* Muallif */}
                  <div style={{ width: 160 }}>
                    <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>Muallif</label>
                    <input value={newAuthor} onChange={(e) => setNewAuthor(e.target.value)} placeholder="Ixtiyoriy" />
                  </div>
                  {/* Quiz */}
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>Slayd biriktirish</label>
                    <select value={newQuizId} onChange={(e) => setNewQuizId(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "2px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--ink)" }}>
                      <option value="">— Ixtiyoriy, keyinroq ham qo'shsa bo'ladi —</option>
                      {quizList.map((q) => (
                        <option key={q.id} value={q.id}>{q.title} ({q._count.slides} slayd)</option>
                      ))}
                    </select>
                  </div>
                  {/* Demo Day */}
                  <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 10, cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={newIsDemo} onChange={(e) => setNewIsDemo(e.target.checked)} />
                    Demo Day
                  </label>
                  {/* Tugmalar */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={addLesson} disabled={saving || !newTitle.trim()}>
                      {saving ? "Saqlanmoqda…" : "Qo'shish"}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Bekor</button>
                  </div>
                </div>
              </div>
            ) : (
              <button className="btn btn-ghost" onClick={openAdd} style={{ marginTop: 12 }}>
                + Dars qo'shish
              </button>
            )
          )}
        </div>
      )}
    </div>
    </Shell>
  );
}
