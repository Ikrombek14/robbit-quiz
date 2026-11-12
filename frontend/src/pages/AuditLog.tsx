import { useEffect, useState } from "react";
import Shell from "../components/Shell";
import { api } from "../api";
import { useAuth } from "../auth";

// Audit log — saytdagi har bir o'zgartiruvchi harakat: kim, qachon, nima qildi.
// Faqat super admin ko'radi (backend ham requireSuperAdmin). Yozuvlarni o'chirib bo'lmaydi.

interface AuditItem {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  action: string;
  method: string;
  path: string;
  status: number;
  entity: string | null;
  entityId: string | null;
  summary: string | null;
  details: unknown;
  ip: string | null;
}

// Ma'lum amallar uchun o'zbekcha nom
const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Kirish (login)",
  "auth.google": "Kirish (Google)",
  "auth.register": "Ro'yxatdan o'tish",
  "roster.create": "Ustoz qo'shildi",
  "roster.update": "Ustoz tahrirlandi",
  "roster.delete": "Ustoz o'chirildi",
  "roster.import": "Ro'yxat import qilindi",
  "admin.user.update": "Foydalanuvchi huquqi o'zgardi",
  "admin.user.delete": "Foydalanuvchi o'chirildi",
  "admin.user.teacherRequest": "Ustozlik so'rovi hal qilindi",
  "admin.user.bindRoster": "Ro'yxatga biriktirildi",
  "admin.user.statsName": "Statistika nomi biriktirildi",
  "admin.user.hwUnlock": "Uy vazifa bloki ochildi",
  "admin.user.passwordReset": "Parol tiklandi",
};

const QUICK_FILTERS: Array<{ label: string; action: string }> = [
  { label: "Hammasi", action: "" },
  { label: "O'qituvchilar ro'yxati", action: "roster." },
  { label: "Foydalanuvchilar", action: "admin." },
  { label: "Kirishlar", action: "auth." },
];

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("uz-UZ", {
    timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function AuditLog() {
  const { teacher } = useAuth();
  const [items, setItems] = useState<AuditItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [actors, setActors] = useState<Array<{ email: string; name: string | null; count: number }>>([]);
  const [open, setOpen] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [failed, setFailed] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function query(cursor?: string) {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (actor) p.set("actor", actor);
    if (action) p.set("action", action);
    if (failed) p.set("failed", "1");
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (cursor) p.set("cursor", cursor);
    return `/audit?${p.toString()}`;
  }

  async function load(cursor?: string) {
    setLoading(true);
    setErr("");
    try {
      const r = await api<{ items: AuditItem[]; nextCursor: string | null }>(query(cursor));
      setItems((prev) => (cursor ? [...prev, ...r.items] : r.items));
      setNext(r.nextCursor);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Yuklab bo'lmadi");
    } finally {
      setLoading(false);
    }
  }

  // Filtr o'zgarsa qayta yuklash (qidiruv — kichik kechikish bilan)
  useEffect(() => {
    const t = setTimeout(() => load(), q ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, actor, action, failed, from, to]);

  useEffect(() => {
    api<{ actors: typeof actors }>("/audit/actors").then((r) => setActors(r.actors)).catch(() => {});
  }, []);

  if (!teacher?.isSuperAdmin) {
    return (
      <Shell>
        <div className="card center" style={{ marginTop: 40 }}>
          <div style={{ fontSize: 44 }}>🔒</div>
          <h2 style={{ marginTop: 8 }}>Ruxsat yo'q</h2>
          <p className="muted">Audit log faqat bosh administratorlar uchun.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 style={{ fontSize: 28, marginBottom: 2 }}>Audit log</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Saytdagi har bir o'zgartiruvchi harakat: kim, qachon va nima qilgani. Yozuvlarni tahrirlab yoki o'chirib bo'lmaydi.
      </p>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {QUICK_FILTERS.map((f) => (
            <button key={f.label} className={`chip ${action === f.action ? "on" : ""}`} onClick={() => setAction(f.action)}>
              {f.label}
            </button>
          ))}
          <button className={`chip ${failed ? "on" : ""}`} onClick={() => setFailed(!failed)}>Faqat xatolar</button>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input style={{ flex: "2 1 220px" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish: ism, email, amal, tavsif…" />
          <select style={{ flex: "1 1 200px" }} value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">Barcha foydalanuvchilar</option>
            {actors.map((a) => (
              <option key={a.email} value={a.email}>{a.name ? `${a.name} — ` : ""}{a.email} ({a.count})</option>
            ))}
          </select>
          <input type="date" style={{ flex: "0 1 160px" }} value={from} onChange={(e) => setFrom(e.target.value)} title="Sanadan" />
          <input type="date" style={{ flex: "0 1 160px" }} value={to} onChange={(e) => setTo(e.target.value)} title="Sanagacha" />
        </div>
      </div>

      <div className="spacer" />
      {err && <div className="card"><p style={{ color: "#dc2626", margin: 0 }}>{err}</p></div>}
      {!err && items.length === 0 && !loading && <div className="card"><p className="muted" style={{ margin: 0 }}>Yozuv topilmadi.</p></div>}

      <div style={{ display: "grid", gap: 6 }}>
        {items.map((it) => {
          const isOpen = open === it.id;
          const bad = it.status >= 400;
          return (
            <div key={it.id} className="card" style={{ padding: "10px 14px", borderLeft: `4px solid ${bad ? "#dc2626" : "var(--primary)"}` }}>
              <button
                onClick={() => setOpen(isOpen ? null : it.id)}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%" }}
              >
                <div className="between" style={{ gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700 }}>
                    {ACTION_LABEL[it.action] ?? it.action}
                    {bad && <span className="cat-badge t2" style={{ marginLeft: 6, fontSize: 11 }}>xato {it.status}</span>}
                  </span>
                  <span className="muted text-sm">{fmtTime(it.createdAt)}</span>
                </div>
                <div className="text-sm" style={{ marginTop: 2 }}>
                  <b>{it.actorName ?? "—"}</b>
                  <span className="muted"> {it.actorEmail ?? "(login qilmagan)"}</span>
                </div>
                {it.summary && <div className="text-sm" style={{ marginTop: 4, wordBreak: "break-word" }}>{it.summary}</div>}
              </button>
              {isOpen && (
                <div className="text-sm" style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                  <div className="muted">{it.method} {it.path} · status {it.status}{it.ip ? ` · IP ${it.ip}` : ""}</div>
                  {it.details != null && (
                    <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", background: "var(--surface-low)", padding: 10, borderRadius: 8, maxHeight: 400, overflow: "auto", fontSize: 12 }}>
                      {JSON.stringify(it.details, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="spacer" />
      {loading && <p className="muted">Yuklanmoqda…</p>}
      {next && !loading && (
        <button className="btn btn-ghost btn-block" onClick={() => load(next)}>Yana yuklash</button>
      )}
    </Shell>
  );
}
