import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import { TONE_STYLE } from "../stats";
import type { MonthMetrics, TeacherAnalysis, TierCheck } from "../types";

// Ariza formasi (keyingi toifaga o'tish) — Telegram botdagi havola bilan bir xil
const ARIZA_URL = "https://forms.gle/n6pFxqYEfsyF6HDYA";

// Faoliyat metrikalari: goodUp — qiymat oshsa yaxshimi (o'zgarish rangini aniqlaydi)
const METRIC_DEFS: { key: keyof Omit<MonthMetrics, "month">; label: string; unit: string; goodUp: boolean }[] = [
  { key: "umumiyBall", label: "Umumiy ball", unit: "", goodUp: true },
  { key: "uvBajarish", label: "Uy vazifa bajarilishi", unit: "%", goodUp: true },
  { key: "davomat", label: "Davomat", unit: "%", goodUp: true },
  { key: "ketgan", label: "Ketgan o'quvchilar", unit: "%", goodUp: false },
  { key: "kechUv", label: "Kech tekshirish", unit: "%", goodUp: false },
  { key: "kechikish", label: "Kechikish", unit: " daq", goodUp: false },
];

function fmt(v: number | null, unit = ""): string {
  return v == null ? "—" : `${v}${unit}`;
}

/* ---- Line chart (SVG) — 3 oydan uzun davrlar uchun ----
   2px chiziq, nuqtalar sirt rangida halqa bilan, tanlab yorliqlash (oxirgi,
   eng katta, eng kichik qiymat), har nuqtada hover-tooltip. */
function LineChart({ def, months }: { def: (typeof METRIC_DEFS)[number]; months: MonthMetrics[] }) {
  const seq = [...months].reverse(); // eski -> yangi
  const n = seq.length;
  const W = 280, PLOT_H = 88, PAD_X = 16, PAD_TOP = 18, X_BAND = 16;
  const H = PLOT_H + X_BAND;

  const vals = seq.map((m) => m[def.key]);
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const x = (i: number) => PAD_X + (i * (W - 2 * PAD_X)) / (n - 1);
  const y = (v: number) => PAD_TOP + (1 - (v - min) / span) * (PLOT_H - PAD_TOP - 8);

  const pts = seq.map((m, i) => ({ i, month: m.month, v: m[def.key] })).filter((p) => p.v != null) as { i: number; month: string; v: number }[];
  const line = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts[pts.length - 1].i).toFixed(1)},${PLOT_H} L${x(pts[0].i).toFixed(1)},${PLOT_H} Z`;

  // Tanlab yorliqlash: oxirgi nuqta + ekstremumlar (takrorlanmasin)
  const lastP = pts[pts.length - 1];
  const labeled = new Set<number>([lastP.i]);
  const maxP = pts.find((p) => p.v === max);
  const minP = pts.find((p) => p.v === min);
  if (maxP) labeled.add(maxP.i);
  if (minP) labeled.add(minP.i);

  // Oy yozuvlari: ko'p bo'lsa har ikkinchisini ko'rsatamiz (oxirgisi doim ko'rinadi)
  const showMonth = (i: number) => n <= 8 || i === n - 1 || (n - 1 - i) % 2 === 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }} role="img"
      aria-label={`${def.label} — oylar kesimida`}>
      {/* pastki o'q — hairline */}
      <line x1={PAD_X - 6} y1={PLOT_H} x2={W - PAD_X + 6} y2={PLOT_H} stroke="var(--border)" strokeWidth="1" />
      <path d={area} fill="var(--chart-bar)" opacity="0.1" />
      <path d={line} fill="none" stroke="var(--chart-bar)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p) => (
        <g key={p.i}>
          {/* katta ko'rinmas hit-target + tooltip */}
          <circle cx={x(p.i)} cy={y(p.v)} r="12" fill="transparent">
            <title>{`${p.month}: ${fmt(p.v, def.unit)}`}</title>
          </circle>
          <circle cx={x(p.i)} cy={y(p.v)} r="4" fill="var(--chart-bar)" stroke="var(--surface)" strokeWidth="2" pointerEvents="none" />
          {labeled.has(p.i) && (
            <text x={x(p.i)} y={y(p.v) - 8} textAnchor="middle" pointerEvents="none"
              style={{ fontSize: 10.5, fontWeight: p.i === lastP.i ? 800 : 600, fill: p.i === lastP.i ? "var(--ink)" : "var(--muted)" }}>
              {p.v}
            </text>
          )}
        </g>
      ))}
      {seq.map((m, i) => showMonth(i) && (
        <text key={m.month + i} x={x(i)} y={H - 3} textAnchor="middle"
          style={{ fontSize: 9.5, fontWeight: i === n - 1 ? 700 : 500, fill: i === n - 1 ? "var(--ink)" : "var(--muted)" }}>
          {n <= 6 ? m.month : m.month.slice(0, 4)}
        </text>
      ))}
    </svg>
  );
}

/* ---- Metrika kartasi: oxirgi qiymat + o'zgarish + oylar kesimida ustunli grafik ----
   Ustunlar chapdan o'ngga eski -> yangi; joriy (oxirgi) oy urg'u rangida, o'tganlari
   xira. Har ustun ustida qiymat yozuvi bor (rang kontrasti past bo'lgani uchun ham,
   jadval-ekvivalent sifatida ham). */
function MetricCard({ def, months }: { def: (typeof METRIC_DEFS)[number]; months: MonthMetrics[] }) {
  const seq = [...months].reverse(); // eski -> yangi
  const vals = seq.map((m) => m[def.key]);
  const latest = vals[vals.length - 1] ?? null;
  const prev = vals.length > 1 ? vals[vals.length - 2] : null;

  // O'zgarish (oxirgi oy vs undan oldingi): yo'nalish x "oshgani yaxshimi" -> rang
  let delta: { text: string; color: string } | null = null;
  if (latest != null && prev != null) {
    const d = Math.round((latest - prev) * 10) / 10;
    if (d === 0) {
      delta = { text: "0 o'zgarish", color: "var(--muted)" };
    } else {
      const improved = def.goodUp ? d > 0 : d < 0;
      delta = {
        text: `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}${def.unit}`,
        color: improved ? TONE_STYLE.good.fg : TONE_STYLE.bad.fg,
      };
    }
  }

  const max = Math.max(...vals.map((v) => v ?? 0), 1);
  const PLOT_H = 84; // ustunlar maydoni balandligi (px)

  return (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>{def.label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "2px 0 10px" }}>
        <span style={{ fontSize: 26, fontWeight: 800 }}>{fmt(latest, def.unit)}</span>
        {delta && <span style={{ fontSize: 12.5, fontWeight: 700, color: delta.color }}>{delta.text}</span>}
      </div>
      {vals.filter((v) => v != null).length >= 2 ? (
        // Line chart — barcha davrlar uchun (kamida 2 nuqta bo'lsa)
        <LineChart def={def} months={months} />
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 18, justifyContent: "center" }}>
          {seq.map((m, i) => {
            const v = m[def.key];
            const isLatest = i === seq.length - 1;
            const h = v == null ? 4 : Math.max(4, Math.round((v / max) * PLOT_H));
            return (
              <div key={m.month} title={`${m.month}: ${fmt(v, def.unit)}`}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 40 }}>
                <div style={{ height: PLOT_H + 18, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 3 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: v == null ? "var(--muted)" : "var(--ink)" }}>
                    {fmt(v, "")}
                  </span>
                  <div style={{
                    width: 22, height: h, borderRadius: "4px 4px 0 0",
                    background: v == null ? "var(--chart-bar-dim)" : isLatest ? "var(--chart-bar)" : "var(--chart-bar-dim)",
                  }} />
                </div>
                <span style={{ fontSize: 11.5, color: isLatest ? "var(--ink)" : "var(--muted)", fontWeight: isLatest ? 700 : 500 }}>
                  {m.month}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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

/* ---- Toifa bloki — faoliyat tahlili ichidagi kichik funksiya ---- */
function TierCard({ a }: { a: TeacherAnalysis }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>🎯 Toifa</h2>
        <TierBadge tier={a.currentTier} />
        {!a.isExpert && <span className="muted" style={{ fontSize: 13 }}>Maqsad: {a.targetTier}-toifa</span>}
      </div>
      <p className="muted" style={{ margin: "0 0 10px", fontSize: 13 }}>Guruh limiti: {a.guruhLimit}</p>
      {a.isExpert ? (
        <p style={{ margin: 0, fontWeight: 700 }}>Siz Expert (4) toifadasiz — bu eng yuqori daraja!</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {a.checks.map((c) => (
              <span key={c.key} title={`Talab: ${c.direction === "min" ? "kamida" : "ko'pi bilan"} ${c.required}${c.key === "kechikish" ? " daq" : "%"}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <span className="muted">{c.label}:</span>
                <CheckChip c={c} />
              </span>
            ))}
          </div>
          {a.passed ? (
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontWeight: 700, color: TONE_STYLE.good.fg }}>✅ Barcha talablarga javob berdingiz!</span>
              <a className="btn btn-primary" href={ARIZA_URL} target="_blank" rel="noreferrer">📝 Ariza topshirish</a>
            </div>
          ) : (
            <p className="muted" style={{ margin: "10px 0 0", fontSize: 13 }}>
              {a.targetTier}-toifa uchun {a.checks.filter((c) => !c.ok).length} ta talab yetishmayapti
              (qiymatlar — 3 oylik o'rtacha, kechikish — oxirgi oy).
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Davr variantlari: nechta oy grafiklarga olinadi (12 = Sheets'da bor hamma oy)
const PERIODS = [
  { months: 3, label: "3 oylik" },
  { months: 6, label: "6 oylik" },
  { months: 12, label: "Barcha oylar" },
] as const;

/* ---- Bitta ustozning to'liq tahlili: metrika kartalari + toifa bloki ----
   O'z sahifasida ham, admin panelida (tanlangan ustoz) ham shu ishlatiladi */
function AnalysisView({ a, dim }: { a: TeacherAnalysis; dim: boolean }) {
  return (
    <>
      <div style={{
        display: "grid", gap: 12, marginBottom: 16, opacity: dim ? 0.55 : 1, transition: "opacity .15s",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
      }}>
        {METRIC_DEFS.map((def) => <MetricCard key={def.key} def={def} months={a.months} />)}
      </div>
      <TierCard a={a} />
    </>
  );
}

export default function StatsAnalysis() {
  const { teacher } = useAuth();
  const isAdmin = teacher?.isAdmin === true;
  const [params] = useSearchParams();
  // Foydalanuvchilar sahifasidan "Faoliyat tahlili" bosilganda ?q=<ism> bilan keladi —
  // shu ustoz qidiruvda oldindan to'ldirilib, topilsa avtomatik ochiladi.
  const jumpQ = params.get("q") ?? "";
  const [mine, setMine] = useState<TeacherAnalysis | null>(null);
  const [all, setAll] = useState<TeacherAnalysis[]>([]);
  const [period, setPeriod] = useState<3 | 6 | 12>(3);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState(jumpQ);
  const [branch, setBranch] = useState("");
  // Admin panelida tanlangan ustoz (nameKey) — to'liq tahlili ochiladi
  const [selected, setSelected] = useState<string | null>(null);
  // Sheets sog'lomligi — joriy oy varag'i ofis tomonidan hali yaratilmagan bo'lishi mumkin
  const [sheetsHealth, setSheetsHealth] = useState<{ expectedMonth: string; sheetsHealthy: boolean; latestMonth: string | null } | null>(null);

  // O'z tahlili — davr o'zgarganda qayta olinadi; eski render xira holda turadi
  useEffect(() => {
    setRefetching(true);
    api<{ analysis: TeacherAnalysis | null }>(`/stats/analysis/me?months=${period}`)
      .then((r) => { setMine(r.analysis); setErr(""); })
      .catch((e) => setErr(e instanceof Error ? e.message : "Xatolik"))
      .finally(() => { setLoading(false); setRefetching(false); });
  }, [period]);

  // Boshqa ustozlar tahlili faqat adminga ko'rinadi (davr bilan birga yangilanadi)
  useEffect(() => {
    if (!isAdmin) return;
    api<{ months: string[]; analyses: TeacherAnalysis[]; expectedMonth: string; sheetsHealthy: boolean }>(
      `/stats/analysis/all?months=${period}`
    )
      .then((r) => {
        setAll(r.analyses);
        setSheetsHealth({ expectedMonth: r.expectedMonth, sheetsHealthy: r.sheetsHealthy, latestMonth: r.months[0] ?? null });
      })
      .catch(() => {}); // admin jadvali ochilmasa ham sahifa ishlayveradi
  }, [isAdmin, period]);

  const selectedAnalysis = useMemo(
    () => (selected ? all.find((a) => a.nameKey === selected) ?? null : null),
    [all, selected],
  );

  // ?q= bilan kelingan bo'lsa — ro'yxat yuklangach mos ustozni avtomatik ochamiz
  // (aniq mos kelishi bo'lmasa, birinchi qidiruv natijasi)
  useEffect(() => {
    if (!jumpQ.trim() || all.length === 0 || selected) return;
    const needle = jumpQ.trim().toLowerCase();
    const match = all.find((a) => a.name.toLowerCase() === needle) ?? all.find((a) => a.name.toLowerCase().includes(needle));
    if (match) setSelected(match.nameKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);

  // Tanlangan ustoz paneli ochilganda unga suriltiramiz
  useEffect(() => {
    if (selected) document.getElementById("admin-analysis-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selected]);

  const months = mine?.months.map((m) => m.month) ?? [];

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

  const checkLabels = all[0]?.checks ?? [];

  // Foydalanuvchilar sahifasidan o'tilgan ism Sheet'da topilmadimi — adminga tushuntiramiz
  const jumpNotFound =
    isAdmin && jumpQ.trim().length > 0 && all.length > 0 &&
    !all.some((a) => a.name.toLowerCase().includes(jumpQ.trim().toLowerCase()));

  return (
    <Shell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Faoliyat tahlili</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {months.length ? <>Davr: {months[months.length - 1]} → {months[0]} ({months.length} oy) · </> : null}
          oylar kesimidagi ko'rsatkichlaringiz va toifa holati
        </p>
      </div>

      {isAdmin && sheetsHealth && !sheetsHealth.sheetsHealthy && (
        <div className="card" style={{ marginBottom: 16, border: "2px solid var(--tertiary, #f0c419)" }}>
          <p className="muted" style={{ margin: 0 }}>
            ⚠️ <b>{sheetsHealth.expectedMonth}</b> oyi uchun statistika varag'i Sheet'da hali yaratilmagan
            {sheetsHealth.latestMonth ? <> — hozircha eng so'nggi mavjud ma'lumot: <b>{sheetsHealth.latestMonth}</b></> : null}.
            Ofisdan Sheet'ga yangi oy varag'ini qo'shishni so'rang.
          </p>
        </div>
      )}

      {jumpNotFound && (
        <div className="card" style={{ marginBottom: 16, border: "2px solid var(--tertiary, #f0c419)" }}>
          <p className="muted" style={{ margin: 0 }}>
            "<b>{jumpQ}</b>" nomi hisobot Sheet'ida topilmadi. Ism imlosi Sheet'dagi
            yozuvdan farq qilishi mumkin — pastdagi jadvalda qo'lda qidirib ko'ring.
          </p>
        </div>
      )}

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
      {loading && <p className="muted">Yuklanmoqda…</p>}

      {!loading && !mine && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="muted" style={{ margin: 0 }}>
            Statistikada ismingiz topilmadi{teacher?.name ? <> ("{teacher.name}")</> : null}.
            Ismingiz Sheet'dagi yozuv bilan mos kelishini admin bilan tekshiring.
          </p>
        </div>
      )}

      {!loading && mine && (
        <>
          {/* Ustoz sarlavhasi + davr tanlagichi (bitta filtr qatori) */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", margin: "0 4px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 19, margin: 0 }}>{mine.name}</h2>
              {mine.branch && <span className="muted" style={{ fontSize: 13 }}>{mine.branch}</span>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {PERIODS.map((p) => (
                <button key={p.months}
                  className={period === p.months ? "btn btn-primary" : "btn btn-ghost"}
                  onClick={() => setPeriod(p.months)}
                  disabled={refetching}
                  style={{ padding: "6px 14px", fontSize: 13.5 }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Metrika kartalari + toifa (talablar davr tanlovidan qat'i nazar oxirgi 3 oy bo'yicha) */}
          <AnalysisView a={mine} dim={refetching} />
        </>
      )}

      {/* ---- Barcha ustozlar (faqat admin) ---- */}
      {!loading && isAdmin && all.length > 0 && (
        <>
          {/* Tanlangan ustozning to'liq tahlili (jadval qatori bosilganda) */}
          {selectedAnalysis && (
            <div id="admin-analysis-panel" style={{ marginBottom: 16 }}>
              <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <h2 style={{ fontSize: 19, margin: 0 }}>👁 {selectedAnalysis.name}</h2>
                  {selectedAnalysis.branch && <span className="muted" style={{ fontSize: 13 }}>{selectedAnalysis.branch}</span>}
                </div>
                <button className="btn btn-ghost" onClick={() => setSelected(null)} style={{ padding: "6px 14px", fontSize: 13.5 }}>
                  ✕ Yopish
                </button>
              </div>
              <AnalysisView a={selectedAnalysis} dim={false} />
            </div>
          )}

          <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: 19, margin: 0 }}>Barcha ustozlar · {filtered.length} ta</h2>
              <p className="muted" style={{ margin: "3px 0 0", fontSize: 12.5 }}>Ustozning to'liq tahlilini (grafiklar bilan) ko'rish uchun qatorni bosing</p>
            </div>
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
                  <tr key={a.nameKey}
                    onClick={() => setSelected(a.nameKey === selected ? null : a.nameKey)}
                    style={{ cursor: "pointer", outline: a.nameKey === selected ? "2px solid var(--primary)" : undefined, outlineOffset: -2 }}
                    title="To'liq tahlilini ko'rish">
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
