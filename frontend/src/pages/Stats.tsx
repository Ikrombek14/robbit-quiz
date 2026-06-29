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
    () => [...new Set(rows.map((r) => r.branch).filter(Boolean))].sort() as string[],
    [rows],
  );

  // Reyting tartibi (umumiy ball) — har bir ustozning haqiqiy o'rni saqlanadi
  const ranked = useMemo(
    () => [...rows].sort((a, b) => (b.umumiyBall ?? -1) - (a.umumiyBall ?? -1)).map((s, i) => ({ s, rank: i + 1 })),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return ranked.filter(({ s }) => {
      if (branch && s.branch !== branch) return false;
      if (needle && !`${s.name} ${s.branch ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [ranked, q, branch]);

  return (
    <Shell>
      {/* Sarlavha + qidiruv (tepa) + filial (past) — bitta box ichida */}
      <div
        className="card"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap", marginBottom: 16 }}
      >
        <div>
          <h1 style={{ fontSize: 26, margin: 0 }}>Ustozlar statistikasi</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>To'liq reyting · {rows.length} ta ustoz</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 300, maxWidth: "100%" }}>
          <input
            className="filter-search"
            placeholder="🔍 Ism bo'yicha qidirish…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            style={{
              height: 44, padding: "0 14px", borderRadius: 12, border: "2px solid var(--border)",
              background: "var(--surface)", color: "var(--ink)", fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}
          >
            <option value="">Barcha filial</option>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
      </div>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : filtered.length === 0 ? (
        <div className="card"><p className="muted">Topilmadi.</p></div>
      ) : (
        // Jadval — ustun nomlari bir marta tepada, har ustun alohida
        <div style={{ overflowX: "auto" }}>
          <table className="stats-table">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: "center" }}>#</th>
                <th style={{ textAlign: "left", minWidth: 190 }}>O'qituvchi</th>
                {METRICS.map((m) => (
                  <th key={m.key} style={{ minWidth: 84 }}>{m.short}</th>
                ))}
                <th style={{ minWidth: 74 }}>Umumiy</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ s, rank }) => {
                const bst = TONE_STYLE[ballTone(s.umumiyBall)];
                return (
                  <tr key={s.nameKey + rank}>
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 24, height: 24, borderRadius: 7, fontWeight: 800, fontSize: 12.5,
                        background: rank <= 3 ? "var(--primary-soft)" : "var(--surface-high)",
                        color: rank <= 3 ? "var(--primary)" : "var(--muted)",
                      }}>{rank}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {s.name}
                      {s.branch && <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}> · {s.branch}</span>}
                    </td>
                    {METRICS.map((m) => {
                      const v = s[m.key] as number | null;
                      const st = TONE_STYLE[m.tone(v)];
                      return (
                        <td key={m.key} style={{ textAlign: "center" }}>
                          <span style={{
                            display: "inline-block", minWidth: 46, padding: "4px 10px", borderRadius: 8,
                            fontWeight: 700, fontSize: 13.5, color: st.fg, background: st.bg, border: `1px solid ${st.border}`,
                          }}>
                            {fmtNum(v)}
                          </span>
                        </td>
                      );
                    })}
                    <td style={{ textAlign: "center" }}>
                      <span style={{
                        display: "inline-block", minWidth: 42, padding: "4px 11px", borderRadius: 8,
                        fontWeight: 800, fontSize: 14, color: bst.fg, background: bst.bg, border: `1.5px solid ${bst.border}`,
                      }}>
                        {fmtNum(s.umumiyBall)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
