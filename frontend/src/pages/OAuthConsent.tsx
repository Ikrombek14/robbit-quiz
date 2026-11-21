import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

// Claude kabi tashqi ilova (MCP connector) ulanayotganda chiqadigan ruxsat sahifasi.
// Oqim: ilova → /oauth/authorize (backend) → shu sahifa (?req=...) → "Ruxsat berish" /
// "Rad etish" → backend qaytaradigan havola orqali ilovaga qaytish.

interface ScopeView {
  scope: string;
  label: string;
}
interface ConsentInfo {
  client: { name: string; redirectHost: string };
  requested: ScopeView[];
  granted: ScopeView[];
  eligible: boolean;
  readOnlyDowngrade: boolean;
}

export default function OAuthConsent() {
  const { teacher, loading } = useAuth();
  const location = useLocation();
  const reqToken = new URLSearchParams(location.search).get("req") ?? "";
  const [info, setInfo] = useState<ConsentInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!teacher || !reqToken) return;
    api<ConsentInfo>(`/oauth/consent?req=${encodeURIComponent(reqToken)}`)
      .then(setInfo)
      .catch((e) => setError(e instanceof Error ? e.message : "Xatolik"));
  }, [teacher, reqToken]);

  if (loading) return <div className="container">Yuklanmoqda…</div>;
  // Kirmagan — login sahifasiga, kirgandan keyin shu yerga qaytadi
  if (!teacher) return <Navigate to={`/admin?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;

  async function decide(approve: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ redirectUrl: string }>("/oauth/consent/decision", {
        method: "POST",
        body: JSON.stringify({ req: reqToken, approve }),
      });
      window.location.href = r.redirectUrl; // ilovaga (masalan claude.ai) qaytamiz
    } catch (e) {
      setError(e instanceof Error ? e.message : "Xatolik");
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <div className="card card-narrow">
        <img src="/logo.svg" alt="Robbit" style={{ height: 30, display: "block", margin: "0 auto 14px" }} />
        <h2 style={{ marginTop: 0, textAlign: "center" }}>Ilovaga ruxsat berish</h2>

        {!reqToken && <div className="error">Ruxsat so'rovi topilmadi. Ilovada ulanishni qaytadan boshlang.</div>}
        {error && <div className="error">{error}</div>}
        {!info && !error && reqToken && <p className="muted center">Yuklanmoqda…</p>}

        {info && (
          <>
            <p style={{ marginTop: 0 }}>
              <b>{info.client.name}</b> sizning akkauntingiz (<b>{teacher.name}</b>) nomidan quyidagilarni bajarmoqchi:
            </p>
            <ul style={{ margin: "0 0 12px", paddingLeft: 20 }}>
              {info.requested.map((s) => {
                const given = info.granted.some((g) => g.scope === s.scope);
                return (
                  <li key={s.scope} style={{ marginBottom: 4, opacity: given ? 1 : 0.55 }}>
                    {s.label}
                    {!given && <span className="muted text-sm"> — berilmaydi</span>}
                  </li>
                );
              })}
            </ul>

            {!info.eligible && (
              <div className="error">
                Bu xizmat faqat markaz ustozlari uchun. Ruxsat berib bo'lmaydi — admin bilan bog'laning.
              </div>
            )}
            {info.eligible && info.readOnlyDowngrade && (
              <div className="import-progress" style={{ marginBottom: 12 }}>
                Sizda slayd yaratish huquqi yo'q — ilovaga faqat ko'rish ruxsati beriladi.
              </div>
            )}

            <p className="muted text-sm" style={{ marginTop: 0 }}>
              Har bir qo'shish yoki o'zgartirish amali siz suhbatda tasdiqlagandan keyingina bajariladi.
              Ilova hech narsani o'chira olmaydi — o'chirish faqat platformaning o'zida.
              Ruxsatni istalgan vaqtda <b>Sozlamalar → Ulangan ilovalar</b> bo'limida bekor qilishingiz mumkin.
              Qaytish manzili: <code>{info.client.redirectHost}</code>
            </p>

            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} disabled={busy} onClick={() => decide(false)}>
                Rad etish
              </button>
              <button className="btn" style={{ flex: 1 }} disabled={busy || !info.eligible} onClick={() => decide(true)}>
                {busy ? "Kuting…" : "Ruxsat berish"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
