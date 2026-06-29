import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import Shell from "../components/Shell";
import { METRICS, TONE_STYLE, ballTone, fmtNum } from "../stats";
import type { TeacherStat } from "../types";

// Ixcham metrika chipi (rangli son) — qatorga sig'adigan kichik ko'rinish
function MiniChip({ s, mKey }: { s: TeacherStat; mKey: (typeof METRICS)[number] }) {
  const v = s[mKey.key] as number | null;
  const st = TONE_STYLE[mKey.tone(v)];
  return (
    <span
      title={mKey.label}
      style={{
        display: "inline-flex", alignItems: "center", gap: 2, flexShrink: 0,
        fontSize: 12, fontWeight: 700, color: st.fg, background: st.bg,
        border: `1px solid ${st.border}`, borderRadius: 6, padding: "1px 6px",
      }}
    >
      <span style={{ opacity: 0.7, fontWeight: 600 }}>{mKey.short}</span>
      {fmtNum(v)}
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
    () => [...new Set(rows.map((r) => r.branch).filter(Boolean))] as string[],
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
      <div className="between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, marginBottom: 2 }}>Ustozlar statistikasi</h1>
          <p className="muted" style={{ marginTop: 0 }}>To'liq reyting · {rows.length} ta ustoz</p>
        </div>
      </div>

      {err && <div className="error" style={{ marginTop: 12 }}>{err}</div>}

      <div className="filter-bar" style={{ marginBottom: 10 }}>
        <input className="filter-search" placeholder="🔍 Ism bo'yicha…" value={q} onChange={(e) => setQ(e.target.value)} />
        {branches.length > 0 && (
          <div className="chip-row">
            <button className={`chip ${branch === "" ? "on" : ""}`} onClick={() => setBranch("")}>Hammasi</button>
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
        // Ko'p ustunli ixcham grid — barcha ustozlar scrollsiz bir ekranda
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))",
            gap: 5,
          }}
        >
          {filtered.map(({ s, rank }) => {
            const st = TONE_STYLE[ballTone(s.umumiyBall)];
            return (
              <div
                key={s.nameKey + rank}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                  background: "var(--surface-low)", borderRadius: 8, border: "1px solid var(--border)",
                  minWidth: 0,
                }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0, fontWeight: 800, fontSize: 12,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: rank <= 3 ? "var(--primary-soft)" : "var(--surface-high)",
                  color: rank <= 3 ? "var(--primary)" : "var(--muted)",
                }}>{rank}</span>

                <span style={{
                  flex: "1 1 120px", minWidth: 0, fontWeight: 600, fontSize: 13,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {s.name}
                  {s.branch && <span className="muted" style={{ fontWeight: 400, fontSize: 11.5 }}> · {s.branch}</span>}
                </span>

                <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  {METRICS.map((m) => <MiniChip key={m.key} s={s} mKey={m} />)}
                </span>

                <span style={{
                  flexShrink: 0, fontWeight: 800, fontSize: 13, color: st.fg,
                  background: st.bg, border: `1px solid ${st.border}`, borderRadius: 7, padding: "2px 8px", minWidth: 34, textAlign: "center",
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
