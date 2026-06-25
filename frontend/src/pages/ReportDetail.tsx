import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import Shell from "../components/Shell";

interface TestDetail {
  index: number;
  text: string;
  answer: string;
  correct: boolean;
  timeMs: number;
  correctAns: string;
}
interface PlayerRow {
  nickname: string;
  score: number;
  correctCount: number;
  totalAnswered: number;
  details?: TestDetail[];
}
interface QStat {
  index: number;
  text: string;
  correct: number;
  total: number;
}
interface Report {
  id: string;
  title: string;
  pin: string;
  mode?: string;
  playedAt: string;
  totalSlides: number;
  questionStats: QStat[];
  players: PlayerRow[];
}

export default function ReportDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [openStudent, setOpenStudent] = useState<number | null>(null);

  useEffect(() => {
    api<{ report: Report }>(`/reports/${id}`)
      .then((r) => setReport(r.report))
      .catch((e) => setError(e instanceof Error ? e.message : "Xatolik"));
  }, [id]);

  return (
    <Shell>
      <button className="btn btn-ghost" onClick={() => navigate("/sessions")}>
        ← Sessiyalar
      </button>
      <div style={{ marginTop: 16 }}>
        {error && <div className="error">{error}</div>}
        {!report ? (
          <p className="muted">Yuklanmoqda…</p>
        ) : (
          <>
            <p className="muted">{new Date(report.playedAt).toLocaleString()} · PIN: {report.pin}</p>

            <h3>🏆 Reyting</h3>
            <ol className="leaderboard">
              {report.players.map((p, i) => (
                <li key={i}>
                  <span>
                    {i + 1}. {p.nickname}{" "}
                    <span className="muted" style={{ fontWeight: 400 }}>
                      ({p.correctCount}/{p.totalAnswered} to'g'ri)
                    </span>
                  </span>
                  <span>{p.score}</span>
                </li>
              ))}
            </ol>

            {report.players.some((p) => p.details && p.details.length > 0) && (
              <>
                <h3 style={{ marginTop: 24 }}>📋 O'quvchilar bo'yicha batafsil tahlil</h3>
                {report.players.map((p, i) => {
                  const det = p.details ?? [];
                  if (det.length === 0) return null;
                  const open = openStudent === i;
                  const totalSec = Math.round(det.reduce((a, d) => a + d.timeMs, 0) / 1000);
                  return (
                    <div className="card" key={i} style={{ marginBottom: 10 }}>
                      <div
                        className="between"
                        style={{ cursor: "pointer" }}
                        onClick={() => setOpenStudent(open ? null : i)}
                      >
                        <strong>
                          {i + 1}. {p.nickname}{" "}
                          <span className="muted" style={{ fontWeight: 400 }}>
                            — {p.correctCount}/{p.totalAnswered} to'g'ri · {p.score}/100 ball · {totalSec}s
                          </span>
                        </strong>
                        <span className="material-symbols-outlined">{open ? "expand_less" : "expand_more"}</span>
                      </div>
                      {open && (
                        <div style={{ marginTop: 12 }}>
                          {det.map((d, j) => (
                            <div
                              key={j}
                              style={{
                                padding: "10px 12px",
                                borderRadius: 10,
                                marginBottom: 8,
                                background: d.correct ? "var(--olive-soft)" : "var(--danger-soft)",
                              }}
                            >
                              <div style={{ fontWeight: 600 }}>
                                {d.correct ? "✅" : "❌"} {d.index + 1}. {d.text}
                              </div>
                              <div style={{ fontSize: 14, marginTop: 4 }}>
                                Javobi: <strong>{d.answer}</strong>
                                {!d.correct && d.correctAns && (
                                  <span className="muted"> · To'g'ri: {d.correctAns}</span>
                                )}
                              </div>
                              <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                                ⏱ {(d.timeMs / 1000).toFixed(1)}s
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            <h3 style={{ marginTop: 24 }}>❓ Savollar bo'yicha</h3>
            {report.questionStats.length === 0 ? (
              <p className="muted">Savol statistikasi yo'q.</p>
            ) : (
              report.questionStats.map((q) => {
                const pct = q.total > 0 ? Math.round((q.correct / q.total) * 100) : 0;
                return (
                  <div className="card" key={q.index} style={{ marginBottom: 10 }}>
                    <div className="between">
                      <strong>
                        {q.index + 1}. {q.text}
                      </strong>
                      <span className="badge">{pct}% to'g'ri</span>
                    </div>
                    <div className="bar">
                      <div className="bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="muted">
                      {q.correct} / {q.total} to'g'ri javob berdi
                    </span>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </Shell>
  );
}
