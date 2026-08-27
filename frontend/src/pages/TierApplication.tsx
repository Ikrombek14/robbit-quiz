import { useEffect, useState } from "react";
import { api } from "../api";
import Shell from "../components/Shell";
import { TONE_STYLE } from "../stats";
import type { TierApplicationStatus, TierApplication, TeacherCertificate, TierCheck } from "../types";

function fmtVal(c: TierCheck): string {
  if (c.value == null) return "—";
  return `${c.value}${c.key === "kechikish" ? " daq" : "%"}`;
}

function CheckChip({ c }: { c: TierCheck }) {
  const st = TONE_STYLE[c.ok ? "good" : "bad"];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px", borderRadius: 8,
      fontWeight: 700, fontSize: 13, color: st.fg, background: st.bg, border: `1px solid ${st.border}`,
    }}>
      {c.ok ? "✓" : "✗"} {c.label}: {fmtVal(c)}
      <span className="muted" style={{ fontWeight: 400 }}>
        (talab: {c.direction === "min" ? "kamida" : "ko'pi bilan"} {c.required}{c.key === "kechikish" ? " daq" : "%"})
      </span>
    </span>
  );
}

const STATUS_LABEL: Record<string, { label: string; tone: "good" | "warn" | "bad" | "neutral" }> = {
  PENDING: { label: "Ko'rib chiqilmoqda", tone: "warn" },
  INTERVIEW: { label: "Suhbatga taklif qilindi", tone: "warn" },
  APPROVED: { label: "Tasdiqlandi", tone: "good" },
  REJECTED: { label: "Rad etildi", tone: "bad" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, tone: "neutral" as const };
  const st = TONE_STYLE[s.tone];
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 8, fontWeight: 700, fontSize: 13, color: st.fg, background: st.bg, border: `1px solid ${st.border}` }}>
      {s.label}
    </span>
  );
}

export default function TierApplicationPage() {
  const [status, setStatus] = useState<TierApplicationStatus | null>(null);
  const [certs, setCerts] = useState<TeacherCertificate[]>([]);
  const [history, setHistory] = useState<TierApplication[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [selectedCerts, setSelectedCerts] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [consultedStudyDept, setConsultedStudyDept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    Promise.all([
      api<TierApplicationStatus>("/tier-applications/me"),
      api<{ certificates: TeacherCertificate[] }>("/profile/me").then((r) => r.certificates).catch(() => []),
      api<{ applications: TierApplication[] }>("/tier-applications/mine").then((r) => r.applications).catch(() => []),
    ])
      .then(([s, c, h]) => { setStatus(s); setCerts(c); setHistory(h); })
      .catch((e) => setErr(e instanceof Error ? e.message : "Xatolik"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function submit() {
    if (!status?.checklist) return;
    setErr(""); setBusy(true);
    try {
      await api("/tier-applications", {
        method: "POST",
        body: JSON.stringify({
          note: note.trim() || undefined,
          checklist: status.checklist.map((c) => ({ key: c.key, checked: !!checked[c.key] })),
          certificateIds: Object.keys(selectedCerts).filter((id) => selectedCerts[id]),
          consultedStudyDept,
        }),
      });
      setNote("");
      setChecked({});
      setSelectedCerts({});
      setConsultedStudyDept(false);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  const allKpiOk = status?.kpiChecks?.every((c) => c.ok) ?? false;
  const allChecklistDone = (status?.checklist ?? []).every((c) => checked[c.key]);
  const canSubmit = status?.found && !status.isExpert && !status.pending && status.windowOpen && (allKpiOk || consultedStudyDept) && allChecklistDone && (status.checklist?.length ?? 0) > 0;

  // Tugma nega o'chirilganini aniq ko'rsatish uchun — "nima uchun bosilmayapti?"
  // degan savolga sababsiz o'chirilgan tugmadan ko'ra aniqroq javob berish kerak.
  const blockers: string[] = [];
  if (status?.found && !status.isExpert && !status.pending) {
    if (!status.windowOpen) blockers.push("Ariza oynasi yopiq — faqat har oyning 1–10 sanalari orasida qabul qilinadi.");
    if (!allKpiOk && !consultedStudyDept) blockers.push('Yuqoridagi ✗ belgili ko\'rsatkichlar bajarilmagan — yoki "O\'quv bo\'limi bilan maslahatlashilgan" belgisini qo\'ying.');
    if ((status.checklist?.length ?? 0) === 0) blockers.push("Talablar ro'yxati yuklanmadi — sahifani yangilab ko'ring yoki admin bilan bog'laning.");
    else if (!allChecklistDone) blockers.push('Pastdagi "Bajarilishi kerak bo\'lgan vazifalar" ro\'yxatidagi barcha bandlarni belgilang.');
  }

  return (
    <Shell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Toifa oshirish arizasi</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Talablar bajarilgach, har oyning 1–10 sanasida ariza topshirishingiz mumkin.
        </p>
      </div>

      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}
      {loading && <p className="muted">Yuklanmoqda…</p>}

      {!loading && status && !status.found && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            Statistikada ismingiz topilmadi. Ismingiz Sheet'dagi yozuv bilan mos kelishini admin bilan tekshiring.
          </p>
        </div>
      )}

      {!loading && status?.found && status.isExpert && (
        <div className="card">
          <p style={{ margin: 0, fontWeight: 700 }}>🏆 Siz eng yuqori (Expert) toifadasiz — ariza topshirish shart emas.</p>
        </div>
      )}

      {!loading && status?.found && !status.isExpert && (
        <>
          {status.pending && (
            <div className="card" style={{ marginBottom: 16, border: "2px solid var(--tertiary, #f0c419)" }}>
              <p style={{ margin: 0 }}>
                📝 {status.pending.toTier}-toifaga arizangiz yuborilgan ({new Date(status.pending.createdAt).toLocaleDateString("uz")}) — holati: <StatusBadge status={status.pending.status} />
              </p>
            </div>
          )}

          {!status.pending && !status.windowOpen && (
            <div className="card" style={{ marginBottom: 16, border: "2px solid var(--tertiary, #f0c419)", background: "rgba(240,196,25,0.08)" }}>
              <p style={{ margin: 0, fontWeight: 700 }}>
                ⏳ Ariza oynasi hozir yopiq — faqat har oyning 1–10 sanalari orasida qabul qilinadi. Boshqa sanalarda "Ariza topshirish" tugmasi bosilmaydi.
              </p>
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, marginTop: 0 }}>
              {status.fromTier}-toifa → {status.toTier}-toifa {status.roleName ? `(${status.roleName})` : ""}
            </h2>
            {status.minExperience && <p className="muted" style={{ fontSize: 13 }}>Minimal tajriba: {status.minExperience}</p>}

            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Avtomatik ko'rsatkichlar (3 oylik o'rtacha)</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              {status.kpiChecks?.map((c) => <CheckChip key={c.key} c={c} />)}
            </div>
            {!allKpiOk && !status.pending && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 10, border: "1px solid var(--tertiary, #f0c419)", background: "rgba(240,196,25,0.08)" }}>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>
                  ⚠️ Yuqoridagi ✗ belgili ko'rsatkichlar bajarilmagan. Agar bu bo'yicha o'quv bo'limi bilan
                  gaplashib, ariza topshirishga ruxsat olgan bo'lsangiz, quyidagini belgilang — admin buni ko'radi.
                </p>
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={consultedStudyDept}
                    onChange={(e) => setConsultedStudyDept(e.target.checked)} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>O'quv bo'limi bilan maslahatlashilgan</span>
                </label>
              </div>
            )}

            <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Bajarilishi kerak bo'lgan vazifalar</h3>
            {(status.checklist ?? []).map((c) => (
              <label key={c.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 0", cursor: status.pending ? "default" : "pointer" }}>
                <input type="checkbox" checked={!!checked[c.key]} disabled={!!status.pending}
                  onChange={(e) => setChecked((s) => ({ ...s, [c.key]: e.target.checked }))}
                  style={{ marginTop: 3 }} />
                <span style={{ fontSize: 14 }}>{c.label}</span>
              </label>
            ))}

            {certs.length > 0 && (
              <>
                <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Ariza bilan bog'lash uchun sertifikat tanlang (ixtiyoriy)</h3>
                {certs.map((c) => (
                  <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                    <input type="checkbox" checked={!!selectedCerts[c.id]} disabled={!!status.pending}
                      onChange={(e) => setSelectedCerts((s) => ({ ...s, [c.id]: e.target.checked }))} />
                    <span style={{ fontSize: 14 }}>{c.title}</span>
                  </label>
                ))}
              </>
            )}
            {certs.length === 0 && (
              <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
                Sertifikatlaringiz yo'q — <a href="/settings">Sozlamalar</a> bo'limida yuklashingiz mumkin.
              </p>
            )}

            <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Qo'shimcha izoh / havolalar (ixtiyoriy)</h3>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} disabled={!!status.pending}
              rows={3} placeholder="Masalan: dars taqdimotlariga havolalar, qo'shimcha izoh…" style={{ width: "100%" }} />

            {!status.pending && blockers.length > 0 && (
              <div style={{
                marginTop: 14, padding: 12, borderRadius: 10,
                border: "1px solid var(--danger, #e5484d)", background: "var(--danger-soft, rgba(229,72,77,0.08))",
              }}>
                <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 14 }}>⚠️ Hozircha topshira olmaysiz — sababi:</p>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
                  {blockers.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </div>
            )}

            {!status.pending && (
              <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={!canSubmit || busy} onClick={submit}>
                {busy ? "Yuborilmoqda…" : "Ariza topshirish"}
              </button>
            )}
          </div>
        </>
      )}

      {history.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: 18, marginTop: 0 }}>Arizalar tarixi</h2>
          {history.map((h) => (
            <div key={h.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border, #eee)" }}>
              <span style={{ fontSize: 13 }}>{h.fromTier}-toifa → {h.toTier}-toifa</span>
              <StatusBadge status={h.status} />
              <span className="muted" style={{ fontSize: 12 }}>{new Date(h.createdAt).toLocaleDateString("uz")}</span>
              {h.adminNote && <span className="muted" style={{ fontSize: 12 }}>· {h.adminNote}</span>}
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
