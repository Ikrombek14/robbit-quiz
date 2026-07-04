import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import type { MyResult, Teacher } from "../types";

// O'quvchi shaxsiy sahifasi. Roster'da bo'lmagan (tasdiqlanmagan) foydalanuvchilar
// ustoz paneli o'rniga shu yerga tushadi: avatar, umumiy ball, o'yin natijalari
// va "Ustozlik uchun so'rov" yuborish imkoniyati.
export default function StudentProfile() {
  const { teacher, logout, updateTeacher } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<MyResult[]>([]);
  const [totals, setTotals] = useState({ score: 0, correct: 0, answered: 0 });
  const [loading, setLoading] = useState(true);

  // Ustozlik so'rovi — har doim account ismi bilan yuboriladi (ism kiritilmaydi)
  const [reqOpen, setReqOpen] = useState(false);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqMsg, setReqMsg] = useState("");

  useEffect(() => {
    api<{ results: MyResult[]; totalScore: number; totalCorrect: number; totalAnswered: number }>("/auth/my-results")
      .then((r) => {
        setResults(r.results);
        setTotals({ score: r.totalScore, correct: r.totalCorrect, answered: r.totalAnswered });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!teacher) return null;

  async function sendRequest() {
    setReqMsg("");
    setReqBusy(true);
    try {
      const r = await api<{ teacher: Teacher }>("/auth/teacher-request", { method: "POST" });
      updateTeacher(r.teacher);
      if (r.teacher.approved) {
        // Ism jadvalga mos keldi — darhol ustoz paneli ochiladi
        navigate("/dashboard");
        return;
      }
      setReqOpen(false);
      setReqMsg("");
    } catch (err) {
      setReqMsg(err instanceof Error ? err.message : "Xatolik");
    } finally {
      setReqBusy(false);
    }
  }

  const accuracy = totals.answered > 0 ? Math.round((totals.correct / totals.answered) * 100) : 0;

  return (
    <div className="container" style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 40px" }}>
      {/* Yuqori panel */}
      <div className="between" style={{ marginBottom: 16 }}>
        <Link to="/"><img src="/logo.svg" alt="Robbit" style={{ height: 28, display: "block" }} /></Link>
        <button className="btn btn-ghost" onClick={() => { logout(); navigate("/"); }}>Chiqish</button>
      </div>

      {/* Profil kartasi */}
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        {teacher.picture ? (
          <img src={teacher.picture} alt="" style={{ width: 64, height: 64, borderRadius: "50%" }} referrerPolicy="no-referrer" />
        ) : (
          <span className="side-avatar" style={{ width: 64, height: 64, fontSize: 26 }}>
            {(teacher.name[0] ?? "?").toUpperCase()}
          </span>
        )}
        <div style={{ flex: 1, minWidth: 180 }}>
          <h2 style={{ margin: 0 }}>{teacher.name}</h2>
          <p className="muted" style={{ margin: "2px 0 0" }}>{teacher.email}</p>
        </div>
        <Link to="/join" className="btn">🎮 O'yinga qo'shilish</Link>
      </div>

      {/* Statistika kataklari */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
        <div className="card center" style={{ padding: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{loading ? "…" : totals.score.toLocaleString()}</div>
          <div className="muted text-sm">To'plagan ball</div>
        </div>
        <div className="card center" style={{ padding: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{loading ? "…" : results.length}</div>
          <div className="muted text-sm">O'yinlar</div>
        </div>
        <div className="card center" style={{ padding: 14 }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{loading ? "…" : `${accuracy}%`}</div>
          <div className="muted text-sm">To'g'ri javoblar</div>
        </div>
      </div>

      {/* Natijalar ro'yxati */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Mening natijalarim</h3>
        {loading ? (
          <p className="muted">Yuklanmoqda…</p>
        ) : results.length === 0 ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            Hozircha natijalar yo'q. O'yinga <b>"{teacher.name}"</b> ismi bilan qatnashsangiz, natijalaringiz shu yerda yig'iladi.
          </p>
        ) : (
          <div>
            {results.map((r) => (
              <div key={r.id} className="between" style={{ padding: "10px 0", borderBottom: "1px solid var(--border, #eee)", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                  <div className="muted text-sm">
                    {new Date(r.playedAt).toLocaleDateString("uz-UZ")} · {r.mode === "LIVE" ? "Jonli o'yin" : "Vazifa"} · {r.correctCount}/{r.totalAnswered} to'g'ri
                  </div>
                </div>
                <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{r.score.toLocaleString()} ball</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ustozlik so'rovi */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Ustozmisiz?</h3>
        {teacher.teacherRequestPending ? (
          <p className="muted" style={{ marginBottom: 0 }}>
            ⏳ Ustozlik so'rovingiz yuborilgan. Admin tasdiqlagach ustoz paneli avtomatik ochiladi —
            keyinroq qaytadan kirib ko'ring.
          </p>
        ) : reqOpen ? (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              So'rov accountingizdagi <b>"{teacher.name}"</b> ismi bilan adminga yuboriladi.
              Agar bu ism ustozlar jadvalidagi bilan bir xil bo'lsa, panel darhol ochiladi.
            </p>
            {reqMsg && <div className="error">{reqMsg}</div>}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" disabled={reqBusy} onClick={sendRequest}>
                {reqBusy ? "Yuborilmoqda…" : "✓ So'rovni yuborish"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setReqOpen(false)}>Bekor qilish</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Bu sahifa o'quvchilar uchun. Agar siz Robbit Akademiyasi ustozi bo'lsangiz,
              ustozlik uchun so'rov yuboring.
            </p>
            <button className="btn" onClick={() => setReqOpen(true)}>
              🎓 Ustozlik uchun so'rov yuborish
            </button>
          </>
        )}
      </div>
    </div>
  );
}
