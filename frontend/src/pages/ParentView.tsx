import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { pctColor } from "../components/GradesPanel";

// ---- Ota-ona sahifasi (ochiq, imzolangan havola): faqat o'z farzandining baholari ----

type Crit = "attendance" | "homework" | "quiz" | "practice1" | "practice2" | "behavior";
type S = Record<Crit, number | null> & { pct: number };
interface Data {
  month: string;
  group: string | null;
  teacher: string;
  groupSize: number;
  groupAvg: number;
  student: {
    nickname: string;
    place: number;
    pct: number;
    avg: Record<Crit, number | null>;
    attended: number;
    lessons: number;
    perLesson: { title: string; playedAt: string; scores: S | null }[];
  } | null;
}

const COLS: { key: Crit; label: string; icon: string }[] = [
  { key: "attendance", label: "Davomat", icon: "🕘" },
  { key: "homework", label: "Uy vazifasi", icon: "📚" },
  { key: "quiz", label: "Quiz", icon: "❓" },
  { key: "practice1", label: "Amaliyot 1", icon: "🛠" },
  { key: "practice2", label: "Amaliyot 2", icon: "🛠" },
  { key: "behavior", label: "Odob", icon: "🙂" },
];

const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
function shift(month: string, d: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = new Date(y, m - 1 + d, 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
}
const monthName = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return `${MONTHS[mo - 1]} ${y}`;
};

export default function ParentView() {
  const { token } = useParams();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    fetch(`/api/public/parent/${encodeURIComponent(token ?? "")}?month=${month}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Xatolik");
        setData(j);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Xatolik"));
  }, [token, month]);

  const st = data?.student;

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <h2 style={{ marginBottom: 4 }}>📊 Farzandim natijalari</h2>
      {data && (
        <p className="muted" style={{ marginTop: 0 }}>
          {data.group ? `Guruh: ${data.group} · ` : ""}
          {data.teacher ? `Ustoz: ${data.teacher}` : ""}
        </p>
      )}

      <div className="row" style={{ gap: 8, alignItems: "center", margin: "12px 0" }}>
        <button className="btn btn-ghost" onClick={() => setMonth(shift(month, -1))} aria-label="Oldingi oy">←</button>
        <strong style={{ minWidth: 140, textAlign: "center" }}>{monthName(month)}</strong>
        <button className="btn btn-ghost" onClick={() => setMonth(shift(month, 1))} aria-label="Keyingi oy">→</button>
      </div>

      {error && <div className="error">{error}</div>}
      {!data && !error && <p className="muted">Yuklanmoqda…</p>}
      {data && !st && <div className="card">Bu oyda baholangan dars yo'q.</div>}

      {st && (
        <>
          <div className="card" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div className="muted">O'quvchi</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{st.nickname}</div>
            </div>
            <div>
              <div className="muted">Oylik natija</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: pctColor(st.pct) }}>{st.pct}%</div>
            </div>
            <div>
              <div className="muted">Guruhdagi o'rni</div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>
                {st.place}<span className="muted" style={{ fontSize: 16 }}> / {data!.groupSize}</span>
              </div>
            </div>
            <div>
              <div className="muted">Guruh o'rtachasi</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{data!.groupAvg}%</div>
            </div>
            <div>
              <div className="muted">Qatnashdi</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{st.attended}/{st.lessons} dars</div>
            </div>
          </div>

          <h3>Mezonlar bo'yicha (o'rtacha, 100 dan)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {COLS.map((c) => (
              <div key={c.key} className="card" style={{ textAlign: "center", margin: 0 }}>
                <div style={{ fontSize: 22 }}>{c.icon}</div>
                <div className="muted">{c.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: pctColor(st.avg[c.key]) }}>{st.avg[c.key] ?? "—"}</div>
              </div>
            ))}
          </div>

          <h3>Darslar</h3>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="grades-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>Sana / mavzu</th>
                    {COLS.map((c) => (
                      <th key={c.key} title={c.label}>{c.icon}</th>
                    ))}
                    <th>Jami</th>
                  </tr>
                </thead>
                <tbody>
                  {st.perLesson.map((l, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{new Date(l.playedAt).toLocaleDateString()}</div>
                        <div className="muted" style={{ fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</div>
                      </td>
                      {l.scores
                        ? COLS.map((c) => (
                            <td key={c.key} style={{ color: pctColor(l.scores![c.key]), fontWeight: 700 }}>{l.scores![c.key] ?? "—"}</td>
                          ))
                        : <td colSpan={COLS.length} className="muted">Darsga kelmagan</td>}
                      <td style={{ fontWeight: 800, color: pctColor(l.scores ? l.scores.pct : 0) }}>{l.scores ? l.scores.pct : 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Har bir mezon 100 ball. Kechikish va har bir odobsizlik uchun −10 ball ayiriladi. «—» — o'sha darsda baholanmagan.
          </p>
        </>
      )}
    </div>
  );
}
