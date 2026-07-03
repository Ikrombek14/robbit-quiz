import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import { TONE_STYLE } from "../stats";
import type { TeacherAnalysis, TierCheck } from "../types";

// Ariza formasi (keyingi toifaga o'tish) — Telegram botdagi havola bilan bir xil
const ARIZA_URL = "https://forms.gle/n6pFxqYEfsyF6HDYA";

// Oylik jadval qatorlari: qaysi metrika, qanday birlikda
const MONTH_ROWS: { key: "uvBajarish" | "davomat" | "ketgan" | "kechUv" | "kechikish" | "umumiyBall"; label: string; unit: string }[] = [
  { key: "uvBajarish", label: "Uy vazifa bajarilishi", unit: "%" },
  { key: "davomat", label: "Davomat", unit: "%" },
  { key: "ketgan", label: "Ketgan o'quvchilar", unit: "%" },
  { key: "kechUv", label: "Kech tekshirish", unit: "%" },
  { key: "kechikish", label: "Kechikish", unit: "daq" },
  { key: "umumiyBall", label: "Umumiy ball", unit: "" },
];

function fmt(v: number | null, unit = ""): string {
  return v == null ? "—" : `${v}${unit}`;
}

// Talab holati chipi: ✓ yashil / ✗ qizil
function CheckChip({ c }: { c: TierCheck }) {
  const st = TONE_STYLE[c.ok ? "good" : "bad"];
  return (
    <span style={{
      display: "inline-block", padding: "3px 9px", borderRadius: 8, fontWeight: 700, fontSize: 13,
      color: st.fg, background: st.bg, border: `1px solid ${st.border}`, whiteSpace: "nowrap",
    }}>
      {c.ok ? "✓" : "✗"} {fmt(c.value, c.key === "kechikish" ? " daq" : "%")}
    </span>
  );
}

function TierBadge({ tier }: { tier: number }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 11px", borderRadius: 9,
      fontWeight: 800, fontSize: 13.5, background: "var(--primary-soft)", color: "var(--primary)",
    }}>
      {tier >= 4 ? "🏆 Expert" : `${tier}-toifa`}
    </span>
  );
}

export default function StatsAnalysis() {
  const { teacher } = useAuth();
  const [mine, setMine] = useState<TeacherAnalysis | null>(null);
  const [all, setAll] = useState<TeacherAnalysis[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ analysis: TeacherAnalysis | null }>("/stats/analysis/me"),
      api<{ months: string[]; analyses: TeacherAnalysis[] }>("/stats/analysis/all"),
    ])
      .then(([me, everyone]) => {
        setMine(me.analysis);
        setAll(everyone.analyses);
        setMonths(everyone.months);
      })
      .catch((e) => setErr(e instanceof Error ? e.message : "Xatolik"))
      .finally(() => setLoading(false));
  }, []);

  const branches = useMemo(
    () => [...new Set(all.map((a) => a.branch).filter(Boolean))].sort() as string[],
    [all],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((a) => {
      if (branch && a.branch !== branch) return false;
      if (needle && !`${a.name} ${a.branch ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [all, q, branch]);

  const checkLabels = mine?.checks ?? all[0]?.checks ?? [];

  return (
    <Shell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Toifa tahlili</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {months.length ? <>Davr: {months.join(", ")} · </> : null}
          3 oylik o'rtacha ko'rsatkichlar keyingi toifa talablari bilan solishtiriladi
        </p>
      </div>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
      {loading && <p className="muted">Yuklanmoqda…</p>}

      {/* ---- Mening tahlilim ---- */}
      {!loading && (
        <div className="card" style={{ marginBottom: 16 }}>
          {!mine ? (
            <p className="muted" style={{ margin: 0 }}>
              Statistikada ismingiz topilmadi{teacher?.name ? <> ("{teacher.name}")</> : null}.
              Ismingiz Sheet'dagi yozuv bilan mos kelishini admin bilan tekshiring.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                <h2 style={{ fontSize: 19, margin: 0 }}>{mine.name}</h2>
                <TierBadge tier={mine.currentTier} />
                {mine.branch && <span className="muted" style={{ fontSize: 13 }}>{mine.branch}</span>}
              </div>
              <p className="muted" style={{ margin: "0 0 14px", fontSize: 13.5 }}>
                Guruh limiti: {mine.guruhLimit}
              </p>

              {/* Oylik dinamika jadvali */}
              <div style={{ overflowX: "auto", marginBottom: 16 }}>
                <table className="stats-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", minWidth: 170 }}>Ko'rsatkich</th>
                      {mine.months.map((m) => <th key={m.month} style={{ minWidth: 80 }}>{m.month}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {MONTH_ROWS.map((row) => (
                      <tr key={row.key}>
                        <td style={{ fontWeight: 600 }}>{row.label}</td>
                        {mine.months.map((m) => (
                          <td key={m.month} style={{ textAlign: "center" }}>{fmt(m[row.key], row.unit)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Maqsad toifa talablari */}
              {mine.isExpert ? (
                <p style={{ margin: 0, fontWeight: 700 }}>🏆 Siz Expert (4) toifadasiz — bu eng yuqori daraja!</p>
              ) : (
                <>
                  <h3 style={{ fontSize: 16, margin: "0 0 10px" }}>🎯 Maqsad: {mine.targetTier}-toifa</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {mine.checks.map((c) => (
                      <div key={c.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14 }}>
                          {c.label}
                          <span className="muted" style={{ fontSize: 12.5 }}>
                            {" "}(talab: {c.direction === "min" ? "kamida" : "ko'pi bilan"} {c.required}{c.key === "kechikish" ? " daq" : "%"})
                          </span>
                        </span>
                        <CheckChip c={c} />
                      </div>
                    ))}
                  </div>
                  {mine.passed ? (
                    <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, color: TONE_STYLE.good.fg }}>✅ Barcha talablarga javob berdingiz!</span>
                      <a className="btn btn-primary" href={ARIZA_URL} target="_blank" rel="noreferrer">📝 Ariza topshirish</a>
                    </div>
                  ) : (
                    <p style={{ marginTop: 14, marginBottom: 0, fontWeight: 600, color: TONE_STYLE.bad.fg }}>
                      Yetishmayotgan talablar: {mine.checks.filter((c) => !c.ok).length} ta
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ---- Barcha ustozlar ---- */}
      {!loading && all.length > 0 && (
        <>
          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <h2 style={{ fontSize: 19, margin: 0 }}>Barcha ustozlar · {filtered.length} ta</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="filter-search"
                placeholder="🔍 Ism bo'yicha qidirish…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ width: 220 }}
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

          <div style={{ overflowX: "auto" }}>
            <table className="stats-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left", minWidth: 190 }}>O'qituvchi</th>
                  <th style={{ minWidth: 70 }}>Toifa</th>
                  <th style={{ minWidth: 70 }}>Maqsad</th>
                  {checkLabels.map((c) => <th key={c.key} style={{ minWidth: 92 }}>{c.key === "uv" ? "UV bajarish" : c.key === "kechUv" ? "Kech UV" : c.key === "kechikish" ? "Kechikish" : c.label}</th>)}
                  <th style={{ minWidth: 90 }}>Holat</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.nameKey}>
                    <td style={{ fontWeight: 600 }}>
                      {a.name}
                      {a.branch && <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}> · {a.branch}</span>}
                    </td>
                    <td style={{ textAlign: "center" }}><TierBadge tier={a.currentTier} /></td>
                    <td style={{ textAlign: "center", fontWeight: 700 }}>{a.isExpert ? "—" : `${a.targetTier}-toifa`}</td>
                    {a.checks.map((c) => (
                      <td key={c.key} style={{ textAlign: "center" }}>
                        {a.isExpert ? <span className="muted">—</span> : <CheckChip c={c} />}
                      </td>
                    ))}
                    <td style={{ textAlign: "center" }}>
                      {a.isExpert ? (
                        <span title="Eng yuqori toifa">🏆</span>
                      ) : (
                        <span style={{ fontWeight: 800, fontSize: 13, color: a.passed ? TONE_STYLE.good.fg : TONE_STYLE.bad.fg }}>
                          {a.passed ? "Tayyor" : `${a.checks.filter((c) => !c.ok).length} ta kam`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
