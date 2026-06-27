import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import type { QuizListItem, Quiz } from "../types";

const EMOJIS = ["🚀", "🌍", "📐", "🔬", "🎨", "📚", "🧮", "🌟", "🦋", "🎯"];

export default function Dashboard() {
  const { teacher } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ quizzes: QuizListItem[] }>("/quizzes")
      .then((r) => setQuizzes(r.quizzes))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function createQuiz() {
    const r = await api<{ quiz: Quiz }>("/quizzes", {
      method: "POST",
      body: JSON.stringify({ title: "Yangi loyiha", slides: [] }),
    });
    navigate(`/quiz/${r.quiz.id}`);
  }

  const recent = quizzes.slice(0, 4);

  return (
    <Shell>
      <div style={{ display: "flex", gap: 32, alignItems: "flex-start" }}>
        {/* CHAP — asosiy kontent */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: 28, marginBottom: 2 }}>Salom, {teacher?.name ?? "ustoz"}! 👋</h1>
          <p className="muted" style={{ marginTop: 0, marginBottom: 24, fontSize: 15 }}>
            Bugun qanday yangi bilimlar o'rgatamiz?
          </p>

          {/* Tezkor harakatlar */}
          <div className="grid-cards" style={{ marginTop: 0, gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
            <button className="quiz-card" style={{ alignItems: "flex-start", cursor: "pointer", textAlign: "left" }} onClick={createQuiz}>
              <span className="material-symbols-outlined" style={{ fontSize: 30, color: "var(--olive)" }}>add_circle</span>
              <strong className="font-head" style={{ fontSize: 15 }}>Yangi loyiha</strong>
              <span className="muted text-sm">Bo'sh slayddan boshlang</span>
            </button>
            <button className="quiz-card" style={{ alignItems: "flex-start", cursor: "pointer", textAlign: "left" }} onClick={createQuiz}>
              <span className="material-symbols-outlined" style={{ fontSize: 30, color: "var(--c3)" }}>upload_file</span>
              <strong className="font-head" style={{ fontSize: 15 }}>PDF yuklash</strong>
              <span className="muted text-sm">PDF → slaydga aylantirish</span>
            </button>
            <button className="quiz-card" style={{ alignItems: "flex-start", cursor: "pointer", textAlign: "left" }} onClick={() => navigate("/library")}>
              <span className="material-symbols-outlined" style={{ fontSize: 30, color: "var(--c2)" }}>library_books</span>
              <strong className="font-head" style={{ fontSize: 15 }}>Kutubxonam</strong>
              <span className="muted text-sm">Barcha loyihalaringiz</span>
            </button>
          </div>

          {/* So'nggi loyihalar */}
          <div className="between" style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>So'nggi loyihalar</h2>
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate("/library")}>
              Hammasini ko'rish →
            </button>
          </div>

          {loading ? (
            <p className="muted" style={{ marginTop: 12 }}>Yuklanmoqda…</p>
          ) : recent.length === 0 ? (
            <div className="card" style={{ marginTop: 12 }}>
              <p className="muted" style={{ margin: 0 }}>
                Hali loyiha yo'q. "Yangi loyiha" yoki "PDF yuklash" bilan boshlang.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {recent.map((q, i) => (
                <div
                  key={q.id}
                  onClick={() => navigate(`/activity/${q.id}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                    background: "var(--surface-low)", borderRadius: 12,
                    border: "1px solid var(--border)", cursor: "pointer",
                    transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-high)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "var(--surface-low)")}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                    background: "var(--primary-soft)",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                  }}>
                    {EMOJIS[i % EMOJIS.length]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {q.title}
                    </div>
                    <div className="muted text-sm" style={{ marginTop: 2 }}>{q._count.slides} ta slayd</div>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--muted)", flexShrink: 0 }}>
                    {new Date(q.updatedAt).toLocaleDateString("uz-UZ")}
                  </div>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--muted)" }}>chevron_right</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <button className="fab" onClick={createQuiz} title="Yangi loyiha">+</button>
    </Shell>
  );
}

