import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import { METRICS, TONE_STYLE, ballTone, fmtNum } from "../stats";
import type { QuizListItem, TeacherStat } from "../types";

const EMOJIS = ["🚀", "🌍", "📐", "🔬", "🎨", "📚", "🧮", "🌟", "🦋", "🎯"];

// Reyting qatori (ixcham) — bosh sahifadagi top 5 / oxirgi 5 uchun.
// me=true — foydalanuvchining o'z qatori (ajratib ko'rsatiladi).
function RatingRow({ s, rank, me }: { s: TeacherStat; rank: number; me?: boolean }) {
  const st = TONE_STYLE[ballTone(s.umumiyBall)];
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "7px 12px",
      background: me ? "var(--primary-soft)" : "var(--surface-low)", borderRadius: 10,
      border: me ? "1.5px solid var(--primary)" : "1px solid var(--border)",
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 7, flexShrink: 0, fontWeight: 800, fontSize: 13,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: rank <= 3 ? "var(--primary-soft)" : "var(--surface-high)",
        color: rank <= 3 ? "var(--primary)" : "var(--muted)",
      }}>{rank}</div>
      <div style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {s.name}
        {me && <span style={{ fontWeight: 800, fontSize: 12, color: "var(--primary)" }}> (siz)</span>}
        {s.branch && <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}> · {s.branch}</span>}
      </div>
      <div style={{
        flexShrink: 0, fontWeight: 800, fontSize: 14, color: st.fg,
        background: st.bg, border: `1px solid ${st.border}`, borderRadius: 8, padding: "2px 9px",
      }}>
        {fmtNum(s.umumiyBall)}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { teacher } = useAuth();
  const navigate = useNavigate();
  const canCreate = !!(teacher?.isAdmin || teacher?.canCreate); // "slayd qilish" ruxsati

  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [loading, setLoading] = useState(canCreate);
  const [myStat, setMyStat] = useState<TeacherStat | null>(null);
  const [allStats, setAllStats] = useState<TeacherStat[]>([]);
  const [statLoading, setStatLoading] = useState(true);

  // Loyihalar — faqat slayd qila oladiganlar uchun (boshqalarda ham bo'sh bo'ladi)
  useEffect(() => {
    if (!canCreate) return;
    api<{ quizzes: QuizListItem[] }>("/quizzes")
      .then((r) => setQuizzes(r.quizzes))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [canCreate]);

  // Statistika
  useEffect(() => {
    Promise.all([
      api<{ stat: TeacherStat | null }>("/stats/me").then((r) => setMyStat(r.stat)).catch(() => {}),
      api<{ stats: TeacherStat[] }>("/stats/all").then((r) => setAllStats(r.stats)).catch(() => {}),
    ]).finally(() => setStatLoading(false));
  }, []);

  function createQuiz() {
    // Quiz darhol yaratilmaydi — muharrirda birinchi "Saqlash"da yaratiladi
    // (bo'sh "Yangi loyiha"lar to'planib qolmasligi uchun)
    navigate("/quiz/new");
  }

  const recent = quizzes.slice(0, 4);
  const sorted = [...allStats].sort((a, b) => (b.umumiyBall ?? -1) - (a.umumiyBall ?? -1));
  const n = sorted.length;
  const topRows = sorted.slice(0, 5).map((s, i) => ({ s, rank: i + 1 }));
  // Oxirgi 5 o'rin (top bilan ustma-ust tushmasligi uchun faqat 10 tadan ko'p bo'lsa)
  const bottomRows = n > 10 ? sorted.slice(n - 5).map((s, i) => ({ s, rank: n - 5 + i + 1 })) : [];
  // Foydalanuvchining o'z o'rni — top/bottom'da ko'rinmasa, alohida qistirib ko'rsatamiz
  const myRank = myStat ? sorted.findIndex((x) => x.nameKey === myStat.nameKey) + 1 : 0;
  const myRowPinned =
    myRank > 5 && !(bottomRows.length > 0 && myRank > n - 5) ? { s: sorted[myRank - 1], rank: myRank } : null;
  const isMe = (s: TeacherStat) => Boolean(myStat && s.nameKey === myStat.nameKey);

  return (
    <Shell>
      <h1 style={{ fontSize: 28, marginBottom: 2 }}>Salom, {teacher?.name ?? "ustoz"}! 👋</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 24, fontSize: 15 }}>
        Bugun qanday yangi bilimlar o'rgatamiz?
      </p>

      {/* O'z statistikasi — KATTA kataklar */}
      {myStat ? (
        <>
          <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>Mening statistikam</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
              marginBottom: 34,
            }}
          >
            {METRICS.map((m) => {
              const v = myStat[m.key] as number | null;
              const st = TONE_STYLE[m.tone(v)];
              return (
                <div
                  key={m.key}
                  style={{
                    background: st.bg,
                    border: `2px solid ${st.border}`,
                    borderRadius: 20,
                    padding: "22px 24px",
                  }}
                >
                  <div
                    style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", lineHeight: 1.25, minHeight: 36 }}
                  >
                    {m.label}
                  </div>
                  <div style={{ fontSize: 48, fontWeight: 800, color: st.fg, lineHeight: 1.05, marginTop: 8 }}>
                    {fmtNum(v)}
                    {v != null && (
                      <span style={{ fontSize: 18, fontWeight: 700, marginLeft: 4 }}>{m.unit}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : !statLoading && !canCreate ? (
        <div className="card" style={{ marginBottom: 28 }}>
          <p className="muted" style={{ margin: 0 }}>
            Sizning shaxsiy statistikangiz topilmadi. Ism-familiyangiz ro'yxatga mos kelmasa, admin bilan bog'laning.
          </p>
        </div>
      ) : null}

      {/* Tezkor harakatlar — faqat slayd qilish ruxsati bo'lganlar */}
      {canCreate && (
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
      )}

      {/* Keng ekranda reyting va so'nggi loyihalar yonma-yon — fold ostida qolmasin */}
      <div className="dash-cols">
      {/* Ustozlar reytingi — barcha ustozlarga (ixcham: top 5 + oxirgi 5) */}
      {(statLoading || allStats.length > 0) && (
        <section>
          <div className="between" style={{ marginTop: 8 }}>
            <h2 style={{ fontSize: 18, margin: 0 }}>Ustozlar reytingi</h2>
            <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={() => navigate("/stats")}>
              Hammasini ko'rish →
            </button>
          </div>
          {statLoading ? (
            <p className="muted" style={{ marginTop: 12 }}>Yuklanmoqda…</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 12 }}>
              {topRows.map(({ s, rank }) => <RatingRow key={"t" + rank} s={s} rank={rank} me={isMe(s)} />)}
              {myRowPinned && (
                <>
                  <div className="muted" style={{ textAlign: "center", fontSize: 20, lineHeight: 1 }}>⋯</div>
                  <RatingRow s={myRowPinned.s} rank={myRowPinned.rank} me />
                </>
              )}
              {bottomRows.length > 0 && (
                <div className="muted" style={{ textAlign: "center", fontSize: 20, lineHeight: 1, padding: "0" }}>⋯</div>
              )}
              {bottomRows.map(({ s, rank }) => <RatingRow key={"b" + rank} s={s} rank={rank} me={isMe(s)} />)}
            </div>
          )}
        </section>
      )}

      {/* So'nggi loyihalar — faqat slayd qilish ruxsati bo'lganlar */}
      {canCreate && (
        <section>
          <div className="between" style={{ marginTop: 8 }}>
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
                <button
                  key={q.id}
                  className="list-row"
                  onClick={() => navigate(`/activity/${q.id}`)}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: "var(--primary-soft)",
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
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      </div>
    </Shell>
  );
}
