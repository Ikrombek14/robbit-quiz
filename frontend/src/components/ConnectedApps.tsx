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
interface PendingView {
  id: string;
  clientName: string;
  summary: string;
  preview: string;
  createdAt: string;
  expiresAt: string;
}

export default function ConnectedAppsCard() {
  const [grants, setGrants] = useState<OAuthGrantView[] | null>(null);
  const [pending, setPending] = useState<PendingView[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  function load() {
    api<{ grants: OAuthGrantView[] }>("/oauth/grants")
      .then((r) => setGrants(r.grants))
      .catch(() => setDisabled(true)); // MCP o'chiq (404) — kartani ko'rsatmaymiz
    api<{ pending: PendingView[] }>("/oauth/pending")
      .then((r) => setPending(r.pending))
      .catch(() => setPending([]));
  }
  useEffect(load, []);

  async function cancelPending(p: PendingView) {
    if (!confirm(`"${p.summary}" taklifini bekor qilasizmi? Claude uni endi tasdiqlay olmaydi.`)) return;
    setBusyId(p.id);
    setErr("");
    try {
      await api(`/oauth/pending/${p.id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusyId(null);
    }
  }

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

      {pending.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, margin: "16px 0 6px" }}>⏳ Kutilayotgan tasdiqlar</h3>
          <p className="muted text-sm" style={{ marginTop: 0 }}>
            Claude taklif qilgan, lekin hali tasdiqlanmagan amallar. Tasdiq suhbatning o'zida beriladi; bu yerdan bekor qilish mumkin.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {pending.map((p) => (
              <div key={p.id} style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 12 }}>
                <div className="between" style={{ gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <b>{p.summary}</b>
                    <div className="muted text-sm" style={{ marginTop: 2 }}>
                      {p.clientName} · muddati: {new Date(p.expiresAt).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })} gacha
                    </div>
                  </div>
                  <button className="btn btn-ghost" style={{ flexShrink: 0, padding: "6px 12px", fontSize: 14 }} disabled={busyId === p.id} onClick={() => cancelPending(p)}>
                    {busyId === p.id ? "…" : "Bekor qilish"}
                  </button>
                </div>
                <details style={{ marginTop: 6 }}>
                  <summary className="muted text-sm" style={{ cursor: "pointer" }}>Batafsil</summary>
                  <pre className="text-sm" style={{ whiteSpace: "pre-wrap", margin: "6px 0 0", fontFamily: "inherit" }}>{p.preview}</pre>
                </details>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
