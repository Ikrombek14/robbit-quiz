import { useEffect, useState } from "react";
import { api } from "../api";
import Shell from "../components/Shell";
import { TONE_STYLE } from "../stats";
import type { TierApplicationAdmin, TierCheck, ChecklistItem } from "../types";

const STATUS_LABEL: Record<string, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  PENDING: { label: "Ko'rib chiqilmoqda", tone: "warn" },
  INTERVIEW: { label: "Suhbatga taklif qilindi", tone: "warn" },
  APPROVED: { label: "Tasdiqlandi", tone: "good" },
  REJECTED: { label: "Rad etildi", tone: "bad" },
};
const STATUS_OPTIONS = ["PENDING", "INTERVIEW", "APPROVED", "REJECTED"] as const;

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, tone: "neutral" as const };
  const st = TONE_STYLE[s.tone];
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 8, fontWeight: 700, fontSize: 13, color: st.fg, background: st.bg, border: `1px solid ${st.border}` }}>
      {s.label}
    </span>
  );
}

function AppRow({ app, onChanged }: { app: TierApplicationAdmin; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [adminNote, setAdminNote] = useState(app.adminNote ?? "");
  const [busy, setBusy] = useState(false);
  const kpi = JSON.parse(app.kpiSnapshot || "[]") as TierCheck[];
  const checklist = JSON.parse(app.checklist || "[]") as ChecklistItem[];

  async function setStatus(status: string) {
    setBusy(true);
    try {
      await api(`/tier-applications/admin/${app.id}`, { method: "PATCH", body: JSON.stringify({ status, adminNote: adminNote.trim() || null }) });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <strong>{app.teacher?.name ?? "?"}</strong>
        <span className="muted" style={{ fontSize: 13 }}>{app.fromTier}-toifa → {app.toTier}-toifa</span>
        <StatusBadge status={app.status} />
        <span className="muted" style={{ fontSize: 12 }}>{new Date(app.createdAt).toLocaleDateString("uz")}</span>
        <span style={{ marginLeft: "auto" }} className="material-symbols-outlined">{open ? "expand_less" : "expand_more"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border, #eee)", paddingTop: 12 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13 }}>
            📧 {app.teacher?.email} {app.teacher?.phone ? `· 📞 ${app.teacher.phone}` : ""}
          </p>

          <h4 style={{ fontSize: 14, margin: "10px 0 6px" }}>Avtomatik ko'rsatkichlar (topshirish vaqtida)</h4>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {kpi.map((c) => {
              const st = TONE_STYLE[c.ok ? "good" : "bad"];
              return (
                <span key={c.key} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 7, color: st.fg, background: st.bg, border: `1px solid ${st.border}` }}>
                  {c.ok ? "✓" : "✗"} {c.label}: {c.value ?? "—"}
                </span>
              );
            })}
          </div>

          <h4 style={{ fontSize: 14, margin: "12px 0 6px" }}>Vazifalar checklisti</h4>
          {checklist.map((c) => (
            <div key={c.key} style={{ fontSize: 13, padding: "2px 0" }}>{c.checked ? "☑" : "☐"} {c.label}</div>
          ))}

          {app.certificates.length > 0 && (
            <>
              <h4 style={{ fontSize: 14, margin: "12px 0 6px" }}>Biriktirilgan sertifikatlar</h4>
              {app.certificates.map((c) => (
                <div key={c.id} style={{ fontSize: 13 }}>
                  <a href={c.fileUrl} target="_blank" rel="noreferrer">{c.title}</a>
                </div>
              ))}
            </>
          )}

          {app.note && (
            <>
              <h4 style={{ fontSize: 14, margin: "12px 0 6px" }}>Ustoz izohi</h4>
              <p style={{ fontSize: 13, whiteSpace: "pre-wrap", margin: 0 }}>{app.note}</p>
            </>
          )}

          <h4 style={{ fontSize: 14, margin: "12px 0 6px" }}>Admin izohi</h4>
          <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2} style={{ width: "100%" }}
            placeholder="Komissiya xulosasi, suhbat sanasi va h.k." />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            {STATUS_OPTIONS.filter((s) => s !== app.status).map((s) => (
              <button key={s} className="btn btn-ghost" disabled={busy} onClick={() => setStatus(s)}>
                {STATUS_LABEL[s].label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TierApplicationsAdmin() {
  const [apps, setApps] = useState<TierApplicationAdmin[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    api<{ applications: TierApplicationAdmin[] }>(`/tier-applications/admin/all${filter ? `?status=${filter}` : ""}`)
      .then((r) => setApps(r.applications))
      .finally(() => setLoading(false));
  }
  useEffect(load, [filter]);

  const pendingCount = apps.filter((a) => a.status === "PENDING" || a.status === "INTERVIEW").length;

  return (
    <Shell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Toifa arizalari</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {!filter && `${pendingCount} ta ko'rib chiqilmagan ariza`}
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <button className={!filter ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setFilter("")}>Barchasi</button>
        {STATUS_OPTIONS.map((s) => (
          <button key={s} className={filter === s ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setFilter(s)}>
            {STATUS_LABEL[s].label}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Yuklanmoqda…</p>}
      {!loading && apps.length === 0 && <p className="muted">Ariza yo'q</p>}
      {apps.map((a) => <AppRow key={a.id} app={a} onChanged={load} />)}
    </Shell>
  );
}
