import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import type { QuizListItem, Quiz } from "../types";

const EMOJIS = ["🚀", "🌍", "📐", "🔬", "🎨", "📚", "🧮", "🌟", "🦋", "🎯"];

// O'quv rejaga ommaviy joylash uchun (faqat admin)
const BULK_SUBJECTS = [
  { key: "ROBOTEXNIKA", label: "Robotexnika" },
  { key: "DASTURLASH", label: "Dasturlash" },
];
const BULK_AGES = [
  { key: "MIDDLE", label: "Middle" },
  { key: "SENIOR", label: "Senior" },
];
const BULK_SECTIONS = [
  { key: "DESIGN", label: "Design" },
  { key: "PROGRAMMING", label: "Programming" },
  { key: "ROBOTICS", label: "Robotics" },
];

export default function Library() {
  const navigate = useNavigate();
  const { teacher } = useAuth();
  const isAdmin = teacher?.isAdmin === true;
  const canCreate = !!(teacher?.isAdmin || teacher?.canCreate); // "slayd qilish" ruxsati
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulk, setShowBulk] = useState(false);

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

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
        <div className="row" style={{ gap: 8 }}>
          {isAdmin && (
            <button
              className="btn btn-ghost"
              disabled={selected.size === 0}
              onClick={() => setShowBulk(true)}
              title="Tanlangan darslarni o'quv rejaga qo'shish"
            >
              <span className="material-symbols-outlined">playlist_add</span>
              O'quv rejaga qo'shish{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          )}
          {canCreate && <button className="btn" onClick={createQuiz}>+ Yangi loyiha</button>}
        </div>
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

      {isAdmin && !loading && filtered.length > 0 && (
        <div className="row" style={{ gap: 10, marginTop: 4, marginBottom: 4 }}>
          <button
            className="btn btn-ghost"
            style={{ padding: "4px 10px", fontSize: 13 }}
            onClick={() => setSelected(new Set(filtered.map((x) => x.id)))}
          >
            Hammasini belgilash
          </button>
          {selected.size > 0 && (
            <button
              className="btn btn-ghost"
              style={{ padding: "4px 10px", fontSize: 13 }}
              onClick={() => setSelected(new Set())}
            >
              Bekor qilish ({selected.size})
            </button>
          )}
        </div>
      )}

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
              {isAdmin && (
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(item.id)}
                  title="O'quv rejaga qo'shish uchun tanlash"
                  style={{ width: 22, height: 22, margin: 0, flexShrink: 0, cursor: "pointer" }}
                />
              )}
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
              {canCreate && (
                <>
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
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {showBulk && (
        <BulkPlaceModal
          quizzes={filtered.filter((x) => selected.has(x.id))}
          onClose={() => setShowBulk(false)}
          onDone={(n) => {
            setShowBulk(false);
            setSelected(new Set());
            alert(`✅ ${n} ta dars o'quv rejaga qo'shildi`);
          }}
        />
      )}
    </Shell>
  );
}

/* ============ O'quv rejaga ommaviy joylash (faqat admin) ============ */
// Tanlangan darslarni BITTA yo'nalish/yosh toifa/yil/bo'limga, ketma-ket tartib
// raqamlari bilan joylaydi (mas: Scratch 1–15 → Dasturlash 1-yil, #1…#15).
// Har bir dars uchun alohida muharrirga kirish shart emas.
function BulkPlaceModal({
  quizzes,
  onClose,
  onDone,
}: {
  quizzes: QuizListItem[];
  onClose: () => void;
  onDone: (n: number) => void;
}) {
  const [subject, setSubject] = useState("DASTURLASH");
  const [section, setSection] = useState("DESIGN");
  const [ageGroup, setAgeGroup] = useState("MIDDLE");
  const [year, setYear] = useState(1);
  const [startOrder, setStartOrder] = useState(1);
  const [isDemo, setIsDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState("");

  async function apply() {
    if (quizzes.length === 0) return;
    setBusy(true);
    setErr("");
    setProgress(0);
    let ok = 0;
    try {
      for (let i = 0; i < quizzes.length; i++) {
        await api("/curriculum", {
          method: "POST",
          body: JSON.stringify({
            subject,
            ageGroup,
            year,
            section: subject === "ROBOTEXNIKA" ? section : null,
            order: startOrder - 1 + i,
            title: quizzes[i].title,
            author: null,
            isDemo,
            quizId: quizzes[i].id,
          }),
        });
        ok++;
        setProgress(ok);
      }
      onDone(ok);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Xatolik. Birozdan keyin urinib ko'ring.");
    } finally {
      setBusy(false);
    }
  }

  const chip = (active: boolean): React.CSSProperties => ({
    padding: "6px 14px",
    borderRadius: 8,
    border: "2px solid",
    borderColor: active ? "var(--primary)" : "var(--border)",
    background: active ? "var(--primary-soft)" : "transparent",
    color: active ? "var(--primary)" : "var(--ink)",
    fontWeight: 600,
    fontSize: 14,
    cursor: "pointer",
  });

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="card card-narrow" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "88vh", overflowY: "auto" }}>
        <div className="between">
          <h3 style={{ margin: 0 }}>📚 O'quv rejaga qo'shish</h3>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>✕</button>
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          {quizzes.length} ta dars tanlandi. Hammasi quyidagi joyga, ketma-ket tartib raqamlari bilan qo'shiladi.
        </p>

        <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>Yo'nalish</div>
        <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {BULK_SUBJECTS.map((s) => (
            <button key={s.key} type="button" style={chip(subject === s.key)} onClick={() => setSubject(s.key)}>
              {s.label}
            </button>
          ))}
        </div>

        {subject === "ROBOTEXNIKA" && (
          <>
            <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>Bo'lim</div>
            <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              {BULK_SECTIONS.map((s) => (
                <button key={s.key} type="button" style={chip(section === s.key)} onClick={() => setSection(s.key)}>
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>Yosh toifa</div>
        <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {BULK_AGES.map((a) => (
            <button key={a.key} type="button" style={chip(ageGroup === a.key)} onClick={() => setAgeGroup(a.key)}>
              {a.label}
            </button>
          ))}
        </div>

        <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>O'quv yili</div>
        <div className="row" style={{ gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[1, 2].map((y) => (
            <button key={y} type="button" style={chip(year === y)} onClick={() => setYear(y)}>
              {y}-yil
            </button>
          ))}
        </div>

        <div className="row" style={{ gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ width: 130 }}>
            <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 6 }}>Boshlang'ich #</div>
            <input
              type="number"
              min={1}
              value={startOrder}
              onChange={(e) => setStartOrder(Number(e.target.value) || 1)}
              style={{ textAlign: "center", marginBottom: 0 }}
            />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
            <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} />
            Demo Day
          </label>
        </div>

        {/* Tartib oldindan ko'rinishi */}
        <div style={{ marginTop: 14, maxHeight: 180, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, padding: 8 }}>
          {quizzes.map((qz, i) => (
            <div key={qz.id} style={{ display: "flex", gap: 8, fontSize: 13, padding: "3px 4px" }}>
              <span style={{ fontWeight: 700, color: "var(--primary)", minWidth: 34 }}>#{startOrder + i}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{qz.title}</span>
            </div>
          ))}
        </div>

        {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}

        <button className="btn btn-block" style={{ marginTop: 14 }} onClick={apply} disabled={busy || quizzes.length === 0}>
          {busy ? `Qo'shilmoqda… (${progress}/${quizzes.length})` : `${quizzes.length} ta darsni qo'shish`}
        </button>
        <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          Tartib raqamlarini keyin "O'quv dastur" sahifasida yoki har quiz sozlamalarida o'zgartirsa bo'ladi.
        </p>
      </div>
    </div>
  );
}
