import { useCallback, useEffect, useState } from "react";
import { getSocket } from "../socket";

// ---- Jonli darsda o'quvchilarni baholash paneli (Host ekranining har sahifasida) ----
// Davomat (kechikdi −10), uy vazifasi (100/0), amaliyot 1/2 (0–100), odob (−10).
// Quiz bali o'yindan avtomatik keladi. Ma'lumot serverdagi o'yin holatida turadi.

export interface Grades {
  late: number;
  homework: boolean | null;
  practice1: number | null;
  practice2: number | null;
  behavior: { reason: string; at: number }[];
  quizSum: number;
  quizMax: number;
}
export interface Scores {
  attendance: number;
  homework: number | null;
  quiz: number | null;
  practice1: number | null;
  practice2: number | null;
  behavior: number;
  total: number;
  max: number;
  pct: number;
}
interface Row {
  id: string;
  nickname: string;
  avatar: string;
  connected: boolean;
  grades: Grades;
  scores: Scores;
}

export const BEHAVIOR_REASONS = ["Noutbuk yopilmagan", "O'yin o'ynadi", "Behuda gapirdi", "So'kindi", "Boshqa"];
const QUICK = [100, 80, 60, 40, 0];

type Tab = "start" | "practice" | "behavior";

export function pctColor(p: number | null): string {
  if (p === null) return "var(--muted)";
  if (p >= 80) return "var(--success)";
  if (p >= 50) return "var(--warn)";
  return "var(--danger)";
}

export default function GradesPanel({ pin }: { pin: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("behavior");
  const [rows, setRows] = useState<Row[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [reasonFor, setReasonFor] = useState<string | null>(null); // odob sababi tanlanayotgan o'quvchi
  const [slot, setSlot] = useState<"practice1" | "practice2">("practice1");
  const [toast, setToast] = useState("");

  const apply = (r: { ok: boolean; rows?: Row[]; canUndo?: boolean; error?: string }) => {
    if (r?.ok && r.rows) {
      setRows(r.rows);
      setCanUndo(!!r.canUndo);
    } else if (r?.error) setToast(r.error);
  };
  const refresh = useCallback(() => {
    getSocket().emit("host:grades", { pin }, apply);
  }, [pin]);

  useEffect(() => {
    if (!open) return;
    refresh();
    const id = setInterval(refresh, 4000); // yangi kirgan o'quvchilar ham ko'rinsin
    return () => clearInterval(id);
  }, [open, refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  function grade(playerId: string, action: string, value?: unknown, reason?: string, msg?: string) {
    getSocket().emit("host:grade", { pin, playerId, action, value, reason }, (r: any) => {
      apply(r);
      if (r?.ok && msg) setToast(msg);
    });
  }
  function undo() {
    getSocket().emit("host:gradeUndo", { pin }, (r: any) => {
      apply(r);
      if (r?.ok) setToast("Bekor qilindi");
    });
  }

  const sorted = [...rows].sort((a, b) => a.nickname.localeCompare(b.nickname));

  return (
    <>
      <button className="grades-fab" onClick={() => setOpen(true)} title="O'quvchilarni baholash" aria-label="O'quvchilarni baholash">
        <span className="material-symbols-outlined">grade</span>
        <span className="grades-fab-label">Baholash</span>
      </button>

      {open && (
        <div className="grades-overlay" onClick={() => setOpen(false)}>
          <aside className="grades-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Baholash">
            <div className="grades-head">
              <h3 style={{ margin: 0 }}>⭐ Baholash</h3>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost" disabled={!canUndo} onClick={undo} title="Oxirgi amalni bekor qilish">
                  <span className="material-symbols-outlined">undo</span> Bekor
                </button>
                <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Yopish">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="chip-row" style={{ marginBottom: 12 }}>
              <button className={`chip ${tab === "start" ? "on" : ""}`} onClick={() => setTab("start")}>🕘 Dars boshi</button>
              <button className={`chip ${tab === "practice" ? "on" : ""}`} onClick={() => setTab("practice")}>🛠 Amaliyot</button>
              <button className={`chip ${tab === "behavior" ? "on" : ""}`} onClick={() => setTab("behavior")}>🙂 Odob</button>
            </div>

            {tab === "practice" && (
              <div className="chip-row" style={{ marginBottom: 12 }}>
                <button className={`chip ${slot === "practice1" ? "on" : ""}`} onClick={() => setSlot("practice1")}>Amaliyot 1</button>
                <button className={`chip ${slot === "practice2" ? "on" : ""}`} onClick={() => setSlot("practice2")}>Amaliyot 2</button>
              </div>
            )}

            {sorted.length === 0 && <p className="muted">Hali o'quvchi qo'shilmagan.</p>}

            <div className="grades-list">
              {sorted.map((r) => (
                <div key={r.id} className="grades-row">
                  <div className="grades-name">
                    <span>{r.avatar || "🙂"}</span>
                    <span style={{ fontWeight: 700 }}>{r.nickname}</span>
                    {!r.connected && <span className="muted" style={{ fontSize: 12 }}>(uzilgan)</span>}
                    <span className="grades-pct" style={{ color: pctColor(r.scores.pct) }}>{r.scores.pct}%</span>
                  </div>

                  {tab === "start" && (
                    <div className="grades-actions">
                      <button className="btn btn-ghost" onClick={() => grade(r.id, "late", undefined, undefined, `${r.nickname}: kechikdi −10`)}>
                        ⏰ Kechikdi −10
                      </button>
                      <span className="grades-val">Davomat: <b>{r.scores.attendance}</b></span>
                      <div className="seg">
                        <button className={r.grades.homework === true ? "on ok" : ""} onClick={() => grade(r.id, "homework", r.grades.homework === true ? null : true)}>
                          ✅ Uy vazifa
                        </button>
                        <button className={r.grades.homework === false ? "on bad" : ""} onClick={() => grade(r.id, "homework", r.grades.homework === false ? null : false)}>
                          ❌ Qilmagan
                        </button>
                      </div>
                    </div>
                  )}

                  {tab === "practice" && (
                    <div className="grades-actions">
                      {QUICK.map((q) => (
                        <button key={q} className={`btn ${r.grades[slot] === q ? "" : "btn-ghost"}`} style={{ minWidth: 56 }} onClick={() => grade(r.id, slot, q)}>
                          {q}
                        </button>
                      ))}
                      <input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="—"
                        aria-label="Ball (0–100)"
                        key={`${r.id}-${slot}-${r.grades[slot] ?? ""}`}
                        defaultValue={r.grades[slot] ?? ""}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        onBlur={(e) => {
                          const v = e.target.value === "" ? null : Number(e.target.value);
                          if (v !== r.grades[slot]) grade(r.id, slot, v);
                        }}
                        style={{ width: 80 }}
                      />
                    </div>
                  )}

                  {tab === "behavior" && (
                    <div className="grades-actions">
                      <button className="btn" style={{ background: "var(--danger)" }} onClick={() => setReasonFor(reasonFor === r.id ? null : r.id)}>
                        −10 Odob
                      </button>
                      <span className="grades-val">Odob: <b style={{ color: pctColor(r.scores.behavior) }}>{r.scores.behavior}</b></span>
                      {reasonFor === r.id && (
                        <div className="chip-row" style={{ width: "100%" }}>
                          {BEHAVIOR_REASONS.map((why) => (
                            <button
                              key={why}
                              className="chip"
                              onClick={() => {
                                grade(r.id, "behavior", undefined, why === "Boshqa" ? "" : why, `${r.nickname}: −10 (${why})`);
                                setReasonFor(null);
                              }}
                            >
                              {why}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {toast && <div className="grades-toast">{toast}</div>}
          </aside>
        </div>
      )}
    </>
  );
}
