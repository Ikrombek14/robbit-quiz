import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import Shell from "../components/Shell";
import { METRICS, TONE_STYLE, ballTone, fmtNum } from "../stats";
import type { TeacherStat } from "../types";

export default function Stats() {
  const [rows, setRows] = useState<TeacherStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");

  useEffect(() => {
    api<{ stats: TeacherStat[] }>("/stats/all")
      .then((r) => setRows(r.stats))
      .catch((e) => setErr(e instanceof Error ? e.message : "Xatolik"))
      .finally(() => setLoading(false));
  }, []);

  const branches = useMemo(
    () => [...new Set(rows.map((r) => r.branch).filter(Boolean))] as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...rows]
      .filter((r) => {
        if (branch && r.branch !== branch) return false;
        if (needle && !`${r.name} ${r.branch ?? ""}`.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => (b.umumiyBall ?? -1) - (a.umumiyBall ?? -1));
  }, [rows, q, branch]);

  return (
    <Shell>
      <div className="between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 2 }}>Ustozlar statistikasi</h1>
          <p className="muted" style={{ marginTop: 0 }}>To'liq reyting · {rows.length} ta ustoz</p>
        </div>
      </div>

      {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}

      <div className="filter-bar">
        <input className="filter-search" placeholder="🔍 Ism bo'yicha…" value={q} onChange={(e) => setQ(e.target.value)} />
        {branches.length > 0 && (
          <div className="chip-row">
            <button className={`chip ${branch === "" ? "on" : ""}`} onClick={() => setBranch("")}>Barcha filial</button>
            {branches.map((b) => (
              <button key={b} className={`chip ${branch === b ? "on" : ""}`} onClick={() => setBranch(b)}>{b}</button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : filtered.length === 0 ? (
        <div className="card"><p className="muted">Topilmadi.</p></div>
      ) : (
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table className="stats-table">
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: "center" }}>#</th>
                <th style={{ textAlign: "left", minWidth: 160 }}>O'qituvchi</th>
                <th style={{ textAlign: "left", minWidth: 90 }}>Filial</th>
                {METRICS.map((m) => (
                  <th key={m.key} style={{ minWidth: 78 }}>{m.short}</th>
                ))}
                <th style={{ minWidth: 70 }}>Umumiy</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.nameKey + i}>
                  <td style={{ textAlign: "center", color: "var(--muted)", fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td className="muted">{s.branch ?? "—"}</td>
                  {METRICS.map((m) => {
                    const v = s[m.key] as number | null;
                    const st = TONE_STYLE[m.tone(v)];
                    return (
                      <td key={m.key} style={{ textAlign: "center" }}>
                        <span style={{
                          display: "inline-block", minWidth: 44, padding: "3px 8px", borderRadius: 8,
                          fontWeight: 700, color: st.fg, background: st.bg, border: `1px solid ${st.border}`,
                        }}>
                          {fmtNum(v)}{v != null && m.unit === "%" ? "%" : ""}
                        </span>
                      </td>
                    );
                  })}
                  {(() => {
                    const st = TONE_STYLE[ballTone(s.umumiyBall)];
                    return (
                      <td style={{ textAlign: "center" }}>
                        <span style={{
                          display: "inline-block", minWidth: 40, padding: "3px 10px", borderRadius: 8,
                          fontWeight: 800, color: st.fg, background: st.bg, border: `1px solid ${st.border}`,
                        }}>
                          {fmtNum(s.umumiyBall)}
                        </span>
                      </td>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
