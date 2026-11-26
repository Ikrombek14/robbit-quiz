import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Shell from "../components/Shell";
import { pctColor } from "../components/GradesPanel";
import { laggingCount } from "../components/LessonGradesTable";

// ---- Oylik reyting: guruh bo'yicha o'quvchilarning oy davomidagi baholari ----

type Crit = "attendance" | "homework" | "quiz" | "practice1" | "practice2" | "behavior";
interface Student {
  key: string;
  nickname: string;
  attended: number;
  lessons: number;
  avg: Record<Crit, number | null>;
  pct: number;
  place: number;
  perLesson: { gameId: string; scores: { pct: number } | null }[];
}
interface Monthly {
  month: string;
  group: string | null;
  lessons: { id: string; title: string; playedAt: string }[];
  students: Student[];
}

const COLS: { key: Crit; label: string }[] = [
  { key: "attendance", label: "Davomat" },
  { key: "homework", label: "Uy vazifa" },
  { key: "quiz", label: "Quiz" },
  { key: "practice1", label: "Amaliyot 1" },
  { key: "practice2", label: "Amaliyot 2" },
  { key: "behavior", label: "Odob" },
];

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const dm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function MonthlyGrades() {
  const navigate = useNavigate();
  const [month, setMonth] = useState(thisMonth());
  const [groups, setGroups] = useState<string[]>([]);
  const [group, setGroup] = useState("");
  const [data, setData] = useState<Monthly | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [byLesson, setByLesson] = useState(false);

  useEffect(() => {
    api<{ groups: string[] }>("/grades/groups")
      .then((r) => {
        setGroups(r.groups);
        if (r.groups.length && !group) setGroup(r.groups[0]);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setData(null);
    setError("");
    const q = new URLSearchParams({ month, ...(group ? { group } : {}) });
    api<Monthly>(`/grades/monthly?${q}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Xatolik"));
  }, [month, group]);

  async function copyParentLink(s: Student) {
    try {
      const r = await api<{ token: string }>("/grades/parent-link", {
        method: "POST",
        body: JSON.stringify({ group: group || null, nickname: s.nickname }),
      });
      const link = `${window.location.origin}/ota-ona/${r.token}`;
      try {
        await navigator.clipboard.writeText(link);
      } catch {
        window.prompt("Havolani nusxalang:", link);
      }
      setCopied(s.key);
      setTimeout(() => setCopied(""), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  const students = data?.students ?? [];
  const lag = laggingCount(students.length);

  return (
    <Shell>
      <h2 style={{ marginTop: 0 }}>⭐ Oylik reyting</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Har dars: davomat, uy vazifasi, quiz, amaliyot va odob (har biri 100 ball). Guruhni sessiya sahifasida belgilang.
      </p>

      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <label htmlFor="m">Oy</label>
          <input id="m" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </div>
        <div style={{ flex: "1 1 220px" }}>
          <label htmlFor="g">Guruh</label>
          <select id="g" value={group} onChange={(e) => setGroup(e.target.value)} style={{ width: "100%" }}>
            <option value="">Barcha darslar (guruhsiz)</option>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 400 }}>
          <input type="checkbox" checked={byLesson} onChange={(e) => setByLesson(e.target.checked)} />
          Darslar bo'yicha ko'rsatish
        </label>
      </div>

      {!group && groups.length > 0 && (
        <p className="muted" style={{ fontSize: 13 }}>
          Guruh tanlanmagan: turli guruhlar aralashib ketadi va kelmagan darslar hisobga olinmaydi.
        </p>
      )}
      {error && <div className="error">{error}</div>}
      {!data && !error && <p className="muted">Yuklanmoqda…</p>}
      {data && students.length === 0 && (
        <p className="muted">Bu oyda {group ? `"${group}" guruhida ` : ""}baholangan dars yo'q.</p>
      )}

      {data && students.length > 0 && (
        <>
          <p className="muted">{data.lessons.length} ta dars · {students.length} nafar o'quvchi</p>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="grades-table" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th>O'quvchi</th>
                    <th>O'rin</th>
                    <th>Jami</th>
                    {byLesson
                      ? data.lessons.map((l) => (
                          <th key={l.id} title={l.title} style={{ cursor: "pointer" }} onClick={() => navigate(`/sessions/${l.id}`)}>
                            {dm(l.playedAt)}
                          </th>
                        ))
                      : COLS.map((c) => <th key={c.key}>{c.label}</th>)}
                    <th>Darslar</th>
                    <th>Ota-ona</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.key} className={i >= students.length - lag && s.place > 1 ? "lagging" : ""}>
                      <td style={{ fontWeight: 600 }}>{s.nickname}</td>
                      <td style={{ fontWeight: 800 }}>{s.place}</td>
                      <td style={{ fontWeight: 800, color: pctColor(s.pct) }}>{s.pct}%</td>
                      {byLesson
                        ? data.lessons.map((l) => {
                            const x = s.perLesson.find((p) => p.gameId === l.id);
                            if (!x) return <td key={l.id} className="muted">·</td>;
                            return (
                              <td key={l.id} style={{ color: pctColor(x.scores ? x.scores.pct : 0), fontWeight: 700 }} title={x.scores ? "" : "Kelmagan"}>
                                {x.scores ? x.scores.pct : "yo'q"}
                              </td>
                            );
                          })
                        : COLS.map((c) => (
                            <td key={c.key} style={{ color: pctColor(s.avg[c.key]), fontWeight: 700 }}>
                              {s.avg[c.key] ?? "—"}
                            </td>
                          ))}
                      <td>{s.attended}/{s.lessons}</td>
                      <td>
                        <button className="btn btn-ghost" onClick={() => copyParentLink(s)} title="Ota-ona uchun havola">
                          {copied === s.key ? "✅ Nusxa" : "🔗 Havola"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Qizil fonda — oxirgi o'rinlar, ular bilan alohida ishlash kerak. «Havola» — ota-onaga yuboriladi: unda faqat o'z
            farzandining natijasi va guruhdagi o'rni ko'rinadi.
          </p>
        </>
      )}
    </Shell>
  );
}
