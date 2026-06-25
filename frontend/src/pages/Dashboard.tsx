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

  const recent = quizzes.slice(0, 6);

  return (
    <Shell>
      <h1 style={{ fontSize: 30, marginBottom: 2 }}>Salom, {teacher?.name ?? "ustoz"}! 👋</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 24, fontSize: 17 }}>
        Bugun qanday yangi bilimlar o'rgatamiz?
      </p>

      {/* Quick actions */}
      <div className="grid-cards" style={{ marginTop: 0 }}>
        <button className="quiz-card" style={{ alignItems: "flex-start", cursor: "pointer", textAlign: "left" }} onClick={createQuiz}>
          <span className="material-symbols-outlined" style={{ fontSize: 32, color: "var(--olive)" }}>add_circle</span>
          <strong className="font-head" style={{ fontSize: 17 }}>Yangi loyiha</strong>
          <span className="muted text-sm">Bo'sh slayd va savollardan boshlang</span>
        </button>
        <button className="quiz-card" style={{ alignItems: "flex-start", cursor: "pointer", textAlign: "left" }} onClick={createQuiz}>
          <span className="material-symbols-outlined" style={{ fontSize: 32, color: "var(--c3)" }}>upload_file</span>
          <strong className="font-head" style={{ fontSize: 17 }}>PDF yuklash</strong>
          <span className="muted text-sm">PDF sahifalarini slaydga aylantiring</span>
        </button>
        <button className="quiz-card" style={{ alignItems: "flex-start", cursor: "pointer", textAlign: "left" }} onClick={() => navigate("/library")}>
          <span className="material-symbols-outlined" style={{ fontSize: 32, color: "var(--c2)" }}>library_books</span>
          <strong className="font-head" style={{ fontSize: 17 }}>Kutubxonam</strong>
          <span className="muted text-sm">Barcha loyihalaringiz</span>
        </button>
      </div>

      {/* Recent */}
      <div className="between" style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 20 }}>So'nggi loyihalar</h2>
        <button className="btn btn-ghost" onClick={() => navigate("/library")}>
          Hammasini ko'rish →
        </button>
      </div>

      {loading ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : recent.length === 0 ? (
        <div className="card">
          <p className="muted">Hali loyiha yo'q. "Yangi loyiha" yoki "PDF yuklash" bilan boshlang.</p>
        </div>
      ) : (
        <div className="grid-cards">
          {recent.map((q, i) => (
            <div
              key={q.id}
              className="quiz-card"
              style={{ cursor: "pointer", padding: 0, overflow: "hidden" }}
              onClick={() => navigate(`/activity/${q.id}`)}
            >
              <div style={{ height: 96, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 44, background: "var(--primary-soft)" }}>
                {EMOJIS[i % EMOJIS.length]}
              </div>
              <div style={{ padding: 16 }}>
                <strong className="font-head">{q.title}</strong>
                <div className="muted text-sm" style={{ marginTop: 4 }}>{q._count.slides} ta slayd</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <button className="fab" onClick={createQuiz} title="Yangi loyiha">+</button>
    </Shell>
  );
}
