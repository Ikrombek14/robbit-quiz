import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import Shell from "../components/Shell";
import { METRICS, TONE_STYLE, ballTone, fmtNum } from "../stats";
import type { TeacherStat } from "../types";

// Ixcham metrika chipi (rangli son) — bir tekisda turishi uchun belgilangan kenglik
function MiniChip({ s, mKey }: { s: TeacherStat; mKey: (typeof METRICS)[number] }) {
  const v = s[mKey.key] as number | null;
  const st = TONE_STYLE[mKey.tone(v)];
  return (
    <span
      title={mKey.label}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexShrink: 0,
        minWidth: 96, fontSize: 12.5, fontWeight: 700, color: st.fg, background: st.bg,
        border: `1px solid ${st.border}`, borderRadius: 7, padding: "3px 9px",
      }}
    >
      <span style={{ opacity: 0.7, fontWeight: 600 }}>{mKey.short}</span>
      <span>{fmtNum(v)}</span>
    </span>
  );
}

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
      {/* Sarlavha + filial dropdown + qidiruv — bitta qatorda (statistika teparoqqa chiqadi) */}
      <div className="between" style={{ flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 26, marginBottom: 2 }}>Ustozlar statistikasi</h1>
          <p className="muted" style={{ marginTop: 0 }}>To'liq reyting · {rows.length} ta ustoz</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
          <input
            className="filter-search"
            style={{ minWidth: 240 }}
            placeholder="🔍 Ism bo'yicha qidirish…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : filtered.length === 0 ? (
        <div className="card"><p className="muted">Topilmadi.</p></div>
      ) : (
        // Har bir ustoz — alohida to'liq qatorda (bir qatorda bitta ustoz)
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(({ s, rank }) => {
            const st = TONE_STYLE[ballTone(s.umumiyBall)];
            return (
              <div
                key={s.nameKey + rank}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "9px 14px",
                  background: "var(--surface-low)", borderRadius: 10, border: "1px solid var(--border)",
                }}
              >
                <span style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0, fontWeight: 800, fontSize: 13,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: rank <= 3 ? "var(--primary-soft)" : "var(--surface-high)",
                  color: rank <= 3 ? "var(--primary)" : "var(--muted)",
                }}>{rank}</span>

                <span style={{
                  flex: "0 0 230px", maxWidth: 230, minWidth: 140, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600, fontSize: 14.5,
                }}>
                  {s.name}
                  {s.branch && <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}> · {s.branch}</span>}
                </span>

                <span style={{ display: "flex", gap: 7, flexWrap: "wrap", flex: 1 }}>
                  {METRICS.map((m) => <MiniChip key={m.key} s={s} mKey={m} />)}
                </span>

                <span style={{
                  flexShrink: 0, fontWeight: 800, fontSize: 15, color: st.fg,
                  background: st.bg, border: `1.5px solid ${st.border}`, borderRadius: 8,
                  padding: "3px 12px", minWidth: 42, textAlign: "center",
                }}>
                  {fmtNum(s.umumiyBall)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
