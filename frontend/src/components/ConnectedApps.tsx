import { useEffect, useState } from "react";
import { api } from "../api";

// "Ulangan ilovalar" — Claude kabi ilovalarga (MCP) berilgan ruxsatlar va ularni bekor qilish.
// Foydalanuvchi o'zi uchun (Sozlamalar) va admin istalgan foydalanuvchi uchun (Users) ishlatadi.
// Server'da MCP o'chiq bo'lsa (MCP_ENABLED != true) API 404 qaytaradi — komponent ko'rinmaydi.

export interface OAuthGrantView {
  id: string;
  clientName: string;
  scopes: { scope: string; label: string }[];
  createdAt: string;
  lastUsedAt: string | null;
}

function fmt(d: string | null): string {
  if (!d) return "hali ishlatilmagan";
  return new Date(d).toLocaleString("uz-UZ", { dateStyle: "medium", timeStyle: "short" });
}

export function GrantList({ grants, onRevoke, busyId }: { grants: OAuthGrantView[]; onRevoke: (g: OAuthGrantView) => void; busyId: string | null }) {
  if (grants.length === 0) return <p className="muted text-sm" style={{ margin: 0 }}>Hech qanday ilovaga ruxsat berilmagan.</p>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {grants.map((g) => (
        <div key={g.id} className="between" style={{ gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 12 }}>
          <div style={{ minWidth: 0 }}>
            <b>{g.clientName}</b>
            <div className="text-sm" style={{ marginTop: 2 }}>{g.scopes.map((s) => s.label).join(" · ")}</div>
            <div className="muted text-sm" style={{ marginTop: 2 }}>
              Ruxsat: {fmt(g.createdAt)} · Oxirgi foydalanish: {fmt(g.lastUsedAt)}
            </div>
          </div>
          <button className="btn btn-ghost" style={{ flexShrink: 0, padding: "6px 12px", fontSize: 14 }} disabled={busyId === g.id} onClick={() => onRevoke(g)}>
            {busyId === g.id ? "…" : "Ruxsatni bekor qilish"}
          </button>
        </div>
      ))}
    </div>
  );
}

// Sozlamalar sahifasidagi karta — o'zining ruxsatlari
export default function ConnectedAppsCard() {
  const [grants, setGrants] = useState<OAuthGrantView[] | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  function load() {
    api<{ grants: OAuthGrantView[] }>("/oauth/grants")
      .then((r) => setGrants(r.grants))
      .catch(() => setDisabled(true)); // MCP o'chiq (404) — kartani ko'rsatmaymiz
  }
  useEffect(load, []);

  async function revoke(g: OAuthGrantView) {
    if (!confirm(`"${g.clientName}" ilovasining ruxsatini bekor qilasizmi? U endi akkauntingizdan foydalana olmaydi.`)) return;
    setBusyId(g.id);
    setErr("");
    try {
      await api(`/oauth/grants/${g.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusyId(null);
    }
  }

  if (disabled) return null;
  return (
    <div className="card" style={{ maxWidth: 620, marginTop: 12 }}>
      <h2 style={{ marginTop: 0, fontSize: 20 }}>🔌 Ulangan ilovalar</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Claude kabi ilovalar sizning nomingizdan Robbit Quiz bilan ishlashi uchun bergan ruxsatlaringiz.
      </p>
      {err && <div className="error">{err}</div>}
      {grants === null ? <p className="muted text-sm">Yuklanmoqda…</p> : <GrantList grants={grants} onRevoke={revoke} busyId={busyId} />}
    </div>
  );
}
