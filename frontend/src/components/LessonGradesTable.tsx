import { Fragment, useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { BEHAVIOR_REASONS, pctColor, type Grades, type Scores } from "./GradesPanel";

// ---- Sessiya sahifasi: dars yakunidagi baholar jadvali + guruh nomi ----
// Ustoz dars tugagach ham baholarni tuzatishi mumkin (masalan, amaliyotni keyin tekshirsa).

export interface GradedPlayer {
  id: string;
  nickname: string;
  grades: Grades;
  scores: Scores;
}

const COLS: { key: keyof Scores; label: string }[] = [
  { key: "attendance", label: "Davomat" },
  { key: "homework", label: "Uy vazifa" },
  { key: "quiz", label: "Quiz" },
  { key: "practice1", label: "Amaliyot 1" },
  { key: "practice2", label: "Amaliyot 2" },
  { key: "behavior", label: "Odob" },
];

/** Oxirgi o'rinlar: reytingning pastki chorak qismi (kamida 1 ta, 3+ o'quvchi bo'lsa). */
export function laggingCount(n: number): number {
  return n >= 3 ? Math.max(1, Math.round(n / 4)) : 0;
}

export default function LessonGradesTable({
  reportId,
  players: initial,
  groupName: initialGroup,
}: {
  reportId: string;
  players: GradedPlayer[];
  groupName: string | null;
}) {
  const [players, setPlayers] = useState(initial);
  const [group, setGroup] = useState(initialGroup ?? "");
  const [savedGroup, setSavedGroup] = useState(initialGroup ?? "");
  const [groups, setGroups] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ groups: string[] }>("/grades/groups").then((r) => setGroups(r.groups)).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    const s = [...players].sort((a, b) => b.scores.pct - a.scores.pct || a.nickname.localeCompare(b.nickname));
    const uniq = [...new Set(s.map((p) => p.scores.pct))];
    return s.map((p) => ({ ...p, place: uniq.indexOf(p.scores.pct) + 1 }));
  }, [players]);
  const lag = laggingCount(rows.length);

  async function saveGroup() {
    setError("");
    try {
      const r = await api<{ groupName: string | null }>(`/reports/${reportId}`, {
        method: "PATCH",
        body: JSON.stringify({ groupName: group }),
      });
      setSavedGroup(r.groupName ?? "");
      if (r.groupName && !groups.includes(r.groupName)) setGroups([...groups, r.groupName].sort());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  async function patch(p: GradedPlayer, change: Partial<Grades>) {
    setError("");
    try {
      const r = await api<{ grades: Grades; scores: Scores }>(`/reports/${reportId}/players/${p.id}/grades`, {
        method: "PUT",
        body: JSON.stringify({ ...p.grades, ...change }),
      });
      setPlayers((list) => list.map((x) => (x.id === p.id ? { ...x, grades: r.grades, scores: r.scores } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
    }
  }

  const cell = (v: number | null) => (
    <span style={{ fontWeight: 700, color: pctColor(v) }}>{v === null ? "—" : v}</span>
  );

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <label htmlFor="grp">Guruh (oylik reyting shu guruh ichida hisoblanadi)</label>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            id="grp"
            list="grp-list"
            value={group}
            maxLength={80}
            placeholder="Masalan: Python-3 (Du-Chor-Ju 14:00)"
            onChange={(e) => setGroup(e.target.value)}
            style={{ flex: "1 1 240px" }}
          />
          <datalist id="grp-list">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <button className="btn" disabled={group.trim() === savedGroup} onClick={saveGroup}>
            Saqlash
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="grades-table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>O'quvchi</th>
                {COLS.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
                <th>Jami</th>
                <th>O'rin</th>
                <th aria-label="Tahrirlash" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <Fragment key={p.id}>
                  <tr className={i >= rows.length - lag ? "lagging" : ""}>
                    <td style={{ fontWeight: 600 }}>{p.nickname}</td>
                    {COLS.map((c) => (
                      <td key={c.key}>
                        {cell(p.scores[c.key] as number | null)}
                        {c.key === "quiz" && p.grades.quizMax > 0 && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {p.grades.quizSum}/{p.grades.quizMax}
                          </div>
                        )}
                      </td>
                    ))}
                    <td>
                      <strong>{p.scores.total}</strong>
                      <span className="muted">/{p.scores.max}</span>
                      <div style={{ fontWeight: 800, color: pctColor(p.scores.pct) }}>{p.scores.pct}%</div>
                    </td>
                    <td style={{ fontWeight: 800 }}>{p.place}</td>
                    <td>
                      <button className="icon-btn" onClick={() => setEditing(editing === p.id ? null : p.id)} aria-label="Tahrirlash">
                        <span className="material-symbols-outlined">{editing === p.id ? "expand_less" : "edit"}</span>
                      </button>
                    </td>
                  </tr>
                  {editing === p.id && (
                    <tr>
                      <td colSpan={COLS.length + 4} style={{ textAlign: "left", whiteSpace: "normal", position: "static" }}>
                        <EditGrades p={p} onPatch={(c) => patch(p, c)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {lag > 0 && (
        <p className="muted" style={{ fontSize: 13 }}>
          Qizil fonda — oxirgi o'rinlardagi o'quvchilar (alohida ishlash kerak). Baholanmagan mezon ("—") jamiga kirmaydi.
        </p>
      )}
    </div>
  );
}

function EditGrades({ p, onPatch }: { p: GradedPlayer; onPatch: (c: Partial<Grades>) => void }) {
  const g = p.grades;
  const num = (v: string) => (v === "" ? null : Math.max(0, Math.min(100, Number(v))));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
      <div>
        <label>Kechikishlar soni (har biri −10)</label>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn btn-ghost" disabled={g.late === 0} onClick={() => onPatch({ late: g.late - 1 })}>−</button>
          <strong style={{ minWidth: 24, textAlign: "center" }}>{g.late}</strong>
          <button className="btn btn-ghost" onClick={() => onPatch({ late: g.late + 1 })}>+</button>
        </div>
      </div>
      <div>
        <label>Uy vazifasi</label>
        <div className="seg">
          <button className={g.homework === true ? "on ok" : ""} onClick={() => onPatch({ homework: g.homework === true ? null : true })}>✅ Qildi</button>
          <button className={g.homework === false ? "on bad" : ""} onClick={() => onPatch({ homework: g.homework === false ? null : false })}>❌ Qilmadi</button>
        </div>
      </div>
      {(["practice1", "practice2"] as const).map((k, i) => (
        <div key={k}>
          <label>Amaliyot {i + 1} (0–100)</label>
          <input
            type="number"
            min={0}
            max={100}
            key={`${k}-${g[k] ?? ""}`}
            defaultValue={g[k] ?? ""}
            onBlur={(e) => num(e.target.value) !== g[k] && onPatch({ [k]: num(e.target.value) })}
            style={{ width: 100 }}
          />
        </div>
      ))}
      <div style={{ flex: "1 1 260px" }}>
        <label>Odob (har qoidabuzarlik −10)</label>
        <div className="chip-row">
          {g.behavior.map((b, i) => (
            <button key={i} className="chip" title="Olib tashlash" onClick={() => onPatch({ behavior: g.behavior.filter((_, j) => j !== i) })}>
              −10 {b.reason || "odobsizlik"} ✕
            </button>
          ))}
          <select
            value=""
            onChange={(e) => e.target.value && onPatch({ behavior: [...g.behavior, { reason: e.target.value === "Boshqa" ? "" : e.target.value, at: Date.now() }] })}
            aria-label="Odobsizlik qo'shish"
          >
            <option value="">+ qo'shish…</option>
            {BEHAVIOR_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
