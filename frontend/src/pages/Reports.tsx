import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import Shell from "../components/Shell";

interface ReportItem {
  id: string;
  title: string;
  pin: string;
  mode: string;
  playedAt: string;
  totalSlides: number;
  playerCount: number;
}

export default function Reports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ reports: ReportItem[] }>("/reports")
      .then((r) => setReports(r.reports))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Shell>
      <h1 style={{ fontSize: 28 }}>Sessiyalar</h1>
      <p className="muted" style={{ marginTop: 4 }}>O'ynalgan jonli darslar va natijalari</p>

      {loading ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : reports.length === 0 ? (
        <div className="card">
          <p className="muted">
            Hali sessiya yo'q. Loyihani boshlab, o'quvchilar qatnashgach, natijalar shu yerda chiqadi.
          </p>
        </div>
      ) : (
        <div className="grid-cards">
          {reports.map((r) => (
            <div className="quiz-card" key={r.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/sessions/${r.id}`)}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong className="font-head" style={{ fontSize: 17 }}>{r.title}</strong>
                <span className="badge">{r.mode === "HOMEWORK" ? "📝 Vazifa" : "🔴 Jonli"}</span>
              </div>
              <span className="muted text-sm">{r.playerCount} o'quvchi</span>
              <span className="muted text-sm">{new Date(r.playedAt).toLocaleString()}</span>
              {r.mode !== "HOMEWORK" && <span className="muted text-sm">PIN: {r.pin}</span>}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
