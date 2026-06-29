import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import type { QuizListItem, Quiz } from "../types";

const EMOJIS = ["🚀", "🌍", "📐", "🔬", "🎨", "📚", "🧮", "🌟", "🦋", "🎯"];

export default function Library() {
  const navigate = useNavigate();
  const { teacher } = useAuth();
  const isAdmin = teacher?.isAdmin === true;
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function load() {
    try {
      const r = await api<{ quizzes: QuizListItem[] }>("/quizzes");
      setQuizzes(r.quizzes);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function createQuiz() {
    const r = await api<{ quiz: Quiz }>("/quizzes", {
      method: "POST",
      body: JSON.stringify({ title: "Yangi loyiha", slides: [] }),
    });
    navigate(`/quiz/${r.quiz.id}`);
  }

  async function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Loyihani o'chirishni tasdiqlaysizmi?")) return;
    await api(`/quizzes/${id}`, { method: "DELETE" });
    setQuizzes((qs) => qs.filter((x) => x.id !== id));
  }

  const needle = q.toLowerCase();
  const filtered = quizzes.filter(
    (x) =>
      x.title.toLowerCase().includes(needle) ||
      (isAdmin && (x.owner?.name.toLowerCase().includes(needle) || x.owner?.email.toLowerCase().includes(needle))),
  );

  return (
    <Shell>
      <div className="between">
        <h1 style={{ fontSize: 28 }}>{isAdmin ? "Barcha loyihalar" : "Kutubxonam"}</h1>
        <button className="btn" onClick={createQuiz}>+ Yangi loyiha</button>
      </div>
      {isAdmin && (
        <p className="muted" style={{ marginTop: 4 }}>
          Admin sifatida barcha o'qituvchilarning loyihalarini ko'rasiz.
        </p>
      )}
      <input
        placeholder={isAdmin ? "🔍 Nomi yoki o'qituvchi bo'yicha qidirish…" : "🔍 Nomi bo'yicha qidirish…"}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginTop: 12 }}
      />

      {loading ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : filtered.length === 0 ? (
        <div className="card">
          <p className="muted">{quizzes.length === 0 ? "Hali loyiha yo'q." : "Topilmadi."}</p>
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {filtered.map((item, i) => (
            <div key={item.id} className="lib-row" style={{ cursor: "pointer" }} onClick={() => navigate(`/activity/${item.id}`)}>
              <div className="lib-thumb">{EMOJIS[i % EMOJIS.length]}</div>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <strong className="font-head">{item.title}</strong>
                <div className="muted text-sm">
                  {item._count.slides} ta slayd
                  {isAdmin && item.owner && !item.mine && <> · 👤 {item.owner.name}</>}
                  {isAdmin && item.mine && <> · 👤 Siz</>}
                </div>
              </div>
              <button
                className="btn btn-secondary"
                disabled={item._count.slides === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/host/${item.id}`);
                }}
              >
                ▶ Boshlash
              </button>
              <button
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: "#cae6ff", color: "#004f75" }}
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/quiz/${item.id}`);
                }}
                title="Tahrirlash"
              >
                <span className="material-symbols-outlined">edit</span>
              </button>
              <button
                className="w-11 h-11 rounded-xl flex items-center justify-center"
                style={{ background: "#ffdad6", color: "#ba1a1a" }}
                onClick={(e) => remove(item.id, e)}
                title="O'chirish"
              >
                <span className="material-symbols-outlined">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
