import { useMemo, useState } from "react";

// ---- Sessiya hisobotidagi "Umumiy natijalar" jadvali va ota-onalar uchun Telegram matni ----

export interface ResultQStat {
  index: number; // slayd indeksi
  text: string;
  correct: number;
  total: number;
  type?: string | null;
}
export interface ResultPlayer {
  nickname: string;
  score: number;
  correctCount: number;
  totalAnswered: number;
  details?: { open?: boolean; correct: boolean }[];
  answers?: { answered: number[]; correct: number[] } | null;
}
export interface ResultReport {
  title: string;
  mode?: string;
  playedAt: string;
  questionStats: ResultQStat[];
  players: ResultPlayer[];
}

type Cell = "ok" | "bad" | "none";
interface Row {
  nickname: string;
  correct: number;
  total: number;
  pct: number;
  place: number;
  cells: Cell[] | null;
}

/** O'quvchilar natijasi: to'g'ri javoblar soni, foiz va o'rin (teng foiz — teng o'rin). */
export function computeResults(r: ResultReport): { questions: ResultQStat[]; rows: Row[]; hasMatrix: boolean } {
  // So'rovnoma (POLL) savollarida to'g'ri javob yo'q — natijaga kirmaydi
  const questions = [...r.questionStats].filter((q) => q.type !== "POLL").sort((a, b) => a.index - b.index);
  const isTest = r.mode === "TEST";
  const hasMatrix = !isTest && questions.length > 0 && r.players.some((p) => p.answers);
  const base = r.players.map((p) => {
    if (isTest) {
      const graded = (p.details ?? []).filter((d) => !d.open);
      const total = graded.length || p.totalAnswered;
      const correct = graded.length ? graded.filter((d) => d.correct).length : p.correctCount;
      return { nickname: p.nickname, correct, total, pct: total ? Math.round((correct / total) * 100) : 0, cells: null, score: p.score };
    }
    const total = questions.length;
    let cells: Cell[] | null = null;
    let correct = p.correctCount;
    if (p.answers) {
      const ok = new Set(p.answers.correct);
      const ans = new Set(p.answers.answered);
      cells = questions.map((q) => (ok.has(q.index) ? "ok" : ans.has(q.index) ? "bad" : "none"));
      correct = cells.filter((c) => c === "ok").length;
    }
    correct = Math.min(correct, total);
    return { nickname: p.nickname, correct, total, pct: total ? Math.round((correct / total) * 100) : 0, cells, score: p.score };
  });
  base.sort((a, b) => b.pct - a.pct || b.correct - a.correct || b.score - a.score);
  const rows: Row[] = base.map((x) => ({
    nickname: x.nickname,
    correct: x.correct,
    total: x.total,
    pct: x.pct,
    cells: x.cells,
    // Zich o'rin: 100%, 100%, 86% → 1, 1, 2 (teng natija — teng o'rin)
    place: 1 + new Set(base.filter((y) => y.pct > x.pct).map((y) => y.pct)).size,
  }));
  return { questions, rows, hasMatrix };
}

function pctColor(p: number): { bg: string; fg: string } {
  if (p >= 80) return { bg: "var(--success)", fg: "#fff" };
  if (p >= 50) return { bg: "var(--warn)", fg: "#fff" };
  return { bg: "var(--danger)", fg: "#fff" };
}

const CELL: Record<Cell, { bg: string; fg: string; mark: string; label: string }> = {
  ok: { bg: "var(--success-soft)", fg: "var(--success)", mark: "✓", label: "to'g'ri" },
  bad: { bg: "var(--danger-soft)", fg: "var(--danger)", mark: "✗", label: "xato" },
  none: { bg: "var(--surface-2)", fg: "var(--muted)", mark: "—", label: "javob bermadi" },
};

export function ResultsMatrix({ report }: { report: ResultReport }) {
  const { questions, rows } = useMemo(() => computeResults(report), [report]);
  const n = rows.length;
  const qPct = questions.map((_, qi) => (n ? Math.round((rows.filter((r) => r.cells?.[qi] === "ok").length / n) * 100) : 0));
  const th: React.CSSProperties = { padding: "10px 8px", borderBottom: "1px solid var(--border)", background: "var(--surface)", fontWeight: 700 };
  const td: React.CSSProperties = { padding: "10px 8px", borderBottom: "1px solid var(--border)" };
  const sticky: React.CSSProperties = { position: "sticky", left: 0, zIndex: 1, background: "var(--surface)" };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%", minWidth: 360 + questions.length * 64 }}>
          <thead>
            <tr>
              <th style={{ ...th, ...sticky, textAlign: "left", minWidth: 180 }}>O'quvchi</th>
              <th style={{ ...th, textAlign: "center", minWidth: 110 }}>
                Natija
                <div className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{questions.length} tadan</div>
              </th>
              {questions.map((q, qi) => {
                const c = pctColor(qPct[qi]);
                return (
                  <th key={q.index} style={{ ...th, textAlign: "center", minWidth: 64 }} title={`${q.index + 1}-slayd: ${q.text}`}>
                    <div>Q{qi + 1}</div>
                    <span style={{ display: "inline-block", marginTop: 4, padding: "2px 8px", borderRadius: 8, fontSize: 12, background: c.bg, color: c.fg }}>
                      {qPct[qi]}%
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={{ ...td, ...sticky, fontWeight: 600 }}>
                  <span className="muted" style={{ fontWeight: 400, marginRight: 6 }}>{r.place}.</span>
                  {r.nickname}
                </td>
                <td style={{ ...td, textAlign: "center", whiteSpace: "nowrap" }}>
                  <strong>{r.correct}</strong> ({r.pct}%)
                </td>
                {questions.map((q, qi) => {
                  const c = CELL[r.cells?.[qi] ?? "none"];
                  return (
                    <td key={q.index} title={c.label} style={{ ...td, textAlign: "center", background: c.bg, color: c.fg, fontWeight: 700, borderLeft: "2px solid var(--surface)" }}>
                      {c.mark}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function dateText(iso: string): string {
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const DEFAULT_OUTRO = "Farzandingiz bilan bugungi mavzuni uyda bir bor takrorlab chiqishingizni tavsiya qilamiz. 😊";

export function TelegramSummary({ report }: { report: ResultReport }) {
  const { rows, questions } = useMemo(() => computeResults(report), [report]);
  const [topic, setTopic] = useState(report.title);
  const [outro, setOutro] = useState(DEFAULT_OUTRO);
  const [showCounts, setShowCounts] = useState(true);
  const [copied, setCopied] = useState(false);

  const total = report.mode === "TEST" ? Math.max(0, ...rows.map((r) => r.total)) : questions.length;
  const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.pct, 0) / rows.length) : 0;
  // Medal faqat 0% dan yuqori natijaga (0% li bolaga bronza chiqmasin)
  const medal = (place: number, pct: number) =>
    pct > 0 && place <= 3 ? ["🥇", "🥈", "🥉"][place - 1] : `${place}.`;

  const text = [
    `📚 Bugungi mavzu: ${topic.trim() || report.title}`,
    `📅 ${dateText(report.playedAt)}`,
    "",
    `📊 Quiz natijalari${total ? ` (${total} ta savol)` : ""}:`,
    ...rows.map((r) => `${medal(r.place, r.pct)} ${r.nickname} — ${r.pct}%${showCounts && r.total ? ` (${r.correct}/${r.total})` : ""}`),
    "",
    `👥 Qatnashdi: ${rows.length} nafar · O'rtacha natija: ${avg}%`,
    ...(outro.trim() ? ["", outro.trim()] : []),
  ].join("\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Eski brauzerlar: vaqtinchalik textarea orqali
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="card">
      <p className="muted" style={{ marginTop: 0 }}>Ota-onalar guruhiga yuborish uchun tayyor matn. Mavzu va yakuniy so'zni o'zgartirishingiz mumkin.</p>
      <label htmlFor="tg-topic">Bugungi mavzu</label>
      <input id="tg-topic" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={200} style={{ marginBottom: 12 }} />
      <label htmlFor="tg-outro">Yakuniy so'z (ixtiyoriy)</label>
      <textarea id="tg-outro" value={outro} onChange={(e) => setOutro(e.target.value)} rows={2} maxLength={500} style={{ marginBottom: 8 }} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0 12px", fontWeight: 400 }}>
        <input type="checkbox" checked={showCounts} onChange={(e) => setShowCounts(e.target.checked)} />
        <span>To'g'ri javoblar sonini ham ko'rsatish (masalan 6/7)</span>
      </label>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: "var(--surface-2)",
          borderRadius: 12,
          padding: 14,
          margin: "0 0 12px",
          fontFamily: "inherit",
          fontSize: 15,
          lineHeight: 1.5,
        }}
      >
        {text}
      </pre>
      <button className="btn" onClick={copy}>{copied ? "✅ Nusxa olindi" : "📋 Matnni nusxalash"}</button>
    </div>
  );
}
