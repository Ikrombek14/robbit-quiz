import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import Shell from "../components/Shell";
import { TONE_STYLE } from "../stats";
import type { TierApplicationAdmin, TierCheck, ChecklistItem } from "../types";

type Tone = "good" | "warn" | "bad" | "neutral";
type Tab = "WAITING" | "APPROVED" | "REJECTED";

const STATUS_LABEL: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Ko'rib chiqilmoqda", tone: "warn" },
  INTERVIEW: { label: "Suhbatga taklif qilindi", tone: "warn" },
  APPROVED: { label: "Tasdiqlandi", tone: "good" },
  REJECTED: { label: "Rad etildi", tone: "bad" },
};

// Admin tugmalari — holatga o'tkazuvchi amal nomlari
const ACTION_LABEL: Record<string, string> = {
  PENDING: "Kutishga qaytarish",
  INTERVIEW: "Suhbatga taklif qilish",
  APPROVED: "Tasdiqlash",
  REJECTED: "Rad etish",
};
const STATUS_OPTIONS = ["PENDING", "INTERVIEW", "APPROVED", "REJECTED"] as const;

const TABS: { key: Tab; label: string }[] = [
  { key: "WAITING", label: "Kutayotganlar" },
  { key: "APPROVED", label: "Tasdiqlanganlar" },
  { key: "REJECTED", label: "Rad etilganlar" },
];

const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const ROLE_NAME: Record<number, string> = { 1: "Kichik ustoz", 2: "Ustoz", 3: "Katta ustoz", 4: "Yetakchi ustoz" };

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, tone: "neutral" as const };
  const st = TONE_STYLE[s.tone];
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 8, fontWeight: 700, fontSize: 13, color: st.fg, background: st.bg, border: `1px solid ${st.border}` }}>
      {s.label}
    </span>
  );
}

function parseKpi(app: TierApplicationAdmin): TierCheck[] {
  try { return JSON.parse(app.kpiSnapshot || "[]") as TierCheck[]; } catch { return []; }
}

function kpiUnit(c: TierCheck): string {
  return c.key === "kechikish" ? " daq" : "%";
}

// Qaror sababi: admin izohi bo'lsa — o'sha; bo'lmasa bajarilmagan ko'rsatkichlardan avtomatik.
function reasonText(app: TierApplicationAdmin): string {
  const note = (app.adminNote ?? "").trim();
  if (note) return note;
  const failed = parseKpi(app).filter((c) => !c.ok);
  if (failed.length > 0) {
    return failed
      .map((c) => `${c.label}: ${c.value ?? "—"}${kpiUnit(c)} (talab: ${c.direction === "min" ? "kamida" : "ko'pi bilan"} ${c.required}${kpiUnit(c)})`)
      .join("; ");
  }
  return "";
}

function tierLine(app: TierApplicationAdmin): string {
  return `${app.fromTier}-toifadan ${app.toTier}-toifaga (${ROLE_NAME[app.toTier] ?? `${app.toTier}-toifa`})`;
}

// Bitta ustoz uchun Telegram xabarnoma
function telegramFor(app: TierApplicationAdmin): string {
  const name = app.teacher?.name ?? "Ustoz";
  const reason = reasonText(app);
  if (app.status === "APPROVED") {
    return [
      `✅ Tabriklaymiz, ${name}!`,
      "",
      `Sizning ${tierLine(app)} o'tish arizangiz TASDIQLANDI. 🎉`,
      reason ? `\nSabab / izoh: ${reason}` : "",
      "",
      "Robbit Akademiyasi jamoasi nomidan yangi muvaffaqiyatlar tilaymiz!",
    ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
  }
  return [
    `Hurmatli ${name},`,
    "",
    `Sizning ${tierLine(app)} o'tish arizangiz bu safar QOLDIRILDI. 🙏`,
    `\nSabab: ${reason || "sabab ko'rsatilmagan"}`,
    "",
    "Kamchiliklarni bartaraf etib, keyingi oyning 1–10 sanalari orasida qayta ariza topshirishingiz mumkin. Savollar bo'lsa, o'quv bo'limiga murojaat qiling. 💪",
  ].join("\n");
}

// Oy uchun umumiy Telegram xabarnoma (har oyning 20-sanasida guruhga yuboriladi)
function telegramForMonth(label: string, apps: TierApplicationAdmin[]): string {
  const approved = apps.filter((a) => a.status === "APPROVED");
  const rejected = apps.filter((a) => a.status === "REJECTED");
  const lines: string[] = [`📢 ${label} — toifa oshirish natijalari`, ""];
  if (approved.length > 0) {
    lines.push("✅ Tasdiqlanganlar:");
    approved.forEach((a, i) => lines.push(`${i + 1}. ${a.teacher?.name ?? "?"} — ${a.fromTier}-toifa → ${a.toTier}-toifa (${ROLE_NAME[a.toTier] ?? ""})`));
    lines.push("", "Tabriklaymiz! 🎉", "");
  }
  if (rejected.length > 0) {
    lines.push("❌ Bu safar qoldirilganlar:");
    rejected.forEach((a, i) => {
      const r = reasonText(a);
      lines.push(`${i + 1}. ${a.teacher?.name ?? "?"} — ${a.fromTier}-toifa → ${a.toTier}-toifa${r ? `\n   Sabab: ${r}` : ""}`);
    });
    lines.push("", "Kamchiliklarni bartaraf etib, keyingi oyning 1–10 sanalari orasida qayta ariza topshirishingiz mumkin. 💪", "");
  }
  if (approved.length === 0 && rejected.length === 0) lines.push("Bu oy bo'yicha qaror qabul qilingan arizalar yo'q.", "");
  lines.push("Savollar bo'lsa, o'quv bo'limiga murojaat qiling.");
  return lines.join("\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function TelegramBox({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyText(text)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  }
  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2, var(--surface))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 14 }}>✈️ {title}</strong>
        <button type="button" className="btn btn-ghost" style={{ marginLeft: "auto", padding: "6px 12px", fontSize: 13 }} onClick={copy}>
          {copied ? "Nusxalandi ✓" : "Nusxalash"}
        </button>
      </div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "inherit", fontSize: 14, lineHeight: 1.55 }}>{text}</pre>
    </div>
  );
}

function AppRow({ app, onChanged }: { app: TierApplicationAdmin; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [adminNote, setAdminNote] = useState(app.adminNote ?? "");
  const [busy, setBusy] = useState(false);
  const kpi = parseKpi(app);
  const checklist = (() => { try { return JSON.parse(app.checklist || "[]") as ChecklistItem[]; } catch { return []; } })();
  const decided = app.status === "APPROVED" || app.status === "REJECTED";
  const noteDirty = adminNote.trim() !== (app.adminNote ?? "").trim();

  async function setStatus(status: string) {
    if ((status === "APPROVED" || status === "REJECTED") &&
      !window.confirm(`${app.teacher?.name ?? "Ustoz"} arizasi "${STATUS_LABEL[status].label}" deb belgilansinmi?`)) return;
    setBusy(true);
    try {
      await api(`/tier-applications/admin/${app.id}`, { method: "PATCH", body: JSON.stringify({ status, adminNote: adminNote.trim() || null }) });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  // Yagona xabarnoma: joriy admin izohi (saqlanmagan bo'lsa ham) bilan
  const liveApp = { ...app, adminNote: adminNote.trim() || null };
  const reason = reasonText(liveApp);

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", cursor: "pointer" }} onClick={() => setOpen((v) => !v)}>
        <strong>{app.teacher?.name ?? "?"}</strong>
        <span className="muted" style={{ fontSize: 13 }}>{app.fromTier}-toifa → {app.toTier}-toifa</span>
        <StatusBadge status={app.status} />
        {app.consultedStudyDept && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 9px", borderRadius: 8,
            fontWeight: 700, fontSize: 12, color: TONE_STYLE.bad.fg, background: TONE_STYLE.bad.bg, border: `1px solid ${TONE_STYLE.bad.border}`,
          }}>
            ⚠️ Ko'rsatkich yetishmaydi — maslahatlashilgan
          </span>
        )}
        <span className="muted" style={{ fontSize: 12 }}>{new Date(app.createdAt).toLocaleDateString("uz")}</span>
        <span style={{ marginLeft: "auto" }} className="material-symbols-outlined">{open ? "expand_less" : "expand_more"}</span>
      </div>

      {open && (
        <div style={{ marginTop: 12, borderTop: "1px solid var(--border, #eee)", paddingTop: 12 }}>
          <p style={{ margin: "0 0 8px", fontSize: 13 }}>
            📧 {app.teacher?.email} {app.teacher?.phone ? `· 📞 ${app.teacher.phone}` : ""}
          </p>

          {decided && (
            <div style={{
              padding: 10, borderRadius: 10, marginBottom: 10,
              border: `1px solid ${TONE_STYLE[app.status === "APPROVED" ? "good" : "bad"].border}`,
              background: TONE_STYLE[app.status === "APPROVED" ? "good" : "bad"].bg,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TONE_STYLE[app.status === "APPROVED" ? "good" : "bad"].fg }}>
                {app.status === "APPROVED" ? "✅ Tasdiqlanish sababi" : "❌ Rad etilish sababi"}
              </div>
              <div style={{ fontSize: 14, marginTop: 4, whiteSpace: "pre-wrap" }}>
                {reason || <span className="muted">Sabab ko'rsatilmagan — pastdagi "Admin izohi"ga yozib saqlang.</span>}
              </div>
            </div>
          )}

          {app.consultedStudyDept && (
            <div style={{ padding: 10, borderRadius: 10, border: `1px solid ${TONE_STYLE.bad.border}`, background: TONE_STYLE.bad.bg, marginBottom: 10 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: TONE_STYLE.bad.fg }}>
                ⚠️ Ustoz avtomatik ko'rsatkichlardan birini bajarmagan holda, o'quv bo'limi bilan
                maslahatlashilganini belgilab ariza topshirgan. Quyidagi ✗ belgili bandga alohida e'tibor bering.
              </p>
            </div>
          )}

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

          <h4 style={{ fontSize: 14, margin: "12px 0 6px" }}>Admin izohi {decided ? "(qaror sababi)" : ""}</h4>
          <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2} style={{ width: "100%" }}
            placeholder="Qaror sababi, komissiya xulosasi, suhbat sanasi va h.k." />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            {decided && noteDirty && (
              <button className="btn" disabled={busy} onClick={() => setStatus(app.status)}>Izohni saqlash</button>
            )}
            {STATUS_OPTIONS.filter((s) => s !== app.status).map((s) => (
              <button key={s} className="btn btn-ghost" disabled={busy} onClick={() => setStatus(s)}>
                {ACTION_LABEL[s]}
              </button>
            ))}
          </div>

          {decided && (
            <TelegramBox
              title={app.status === "APPROVED" ? "Telegram xabarnoma (tasdiqlangan)" : "Telegram xabarnoma (qoldirilgan)"}
              text={telegramFor(liveApp)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Ariza topshirilgan oy kaliti: "2026-09"
function monthKey(a: TierApplicationAdmin): string {
  const d = new Date(a.createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

function MonthGroup({ label, apps, monthApps, onChanged }: {
  label: string;
  apps: TierApplicationAdmin[]; // shu tabdagi arizalar
  monthApps: TierApplicationAdmin[]; // shu oyning barcha qarorlari (tasdiqlangan + rad etilgan) — umumiy xabarnoma uchun
  onChanged: () => void;
}) {
  const [showTg, setShowTg] = useState(false);
  return (
    <section style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "0 0 10px" }}>
        <h2 style={{ fontSize: 18, margin: 0 }}>{label}</h2>
        <span className="muted" style={{ fontSize: 13 }}>{apps.length} ta ariza</span>
        <button type="button" className={showTg ? "btn btn-primary" : "btn btn-ghost"} style={{ marginLeft: "auto", padding: "6px 12px", fontSize: 13 }}
          onClick={() => setShowTg((v) => !v)}>
          ✈️ Telegram xabarnoma
        </button>
      </div>
      {showTg && (
        <div style={{ marginBottom: 12 }}>
          <TelegramBox title={`${label} — umumiy xabarnoma (har oyning 20-sanasi uchun)`} text={telegramForMonth(label, monthApps)} />
        </div>
      )}
      {apps.map((a) => <AppRow key={a.id} app={a} onChanged={onChanged} />)}
    </section>
  );
}

export default function TierApplicationsAdmin() {
  const [apps, setApps] = useState<TierApplicationAdmin[]>([]);
  const [tab, setTab] = useState<Tab>("WAITING");
  const [loading, setLoading] = useState(true);

  function load() {
    api<{ applications: TierApplicationAdmin[] }>("/tier-applications/admin/all")
      .then((r) => setApps(r.applications))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const waiting = useMemo(() => apps.filter((a) => a.status === "PENDING" || a.status === "INTERVIEW"), [apps]);
  const approved = useMemo(() => apps.filter((a) => a.status === "APPROVED"), [apps]);
  const rejected = useMemo(() => apps.filter((a) => a.status === "REJECTED"), [apps]);
  const counts: Record<Tab, number> = { WAITING: waiting.length, APPROVED: approved.length, REJECTED: rejected.length };

  // Oyma-oy guruhlash (eng yangi oy tepada)
  const months = useMemo(() => {
    const list = tab === "APPROVED" ? approved : tab === "REJECTED" ? rejected : [];
    const map = new Map<string, TierApplicationAdmin[]>();
    for (const a of list) {
      const k = monthKey(a);
      map.set(k, [...(map.get(k) ?? []), a]);
    }
    return [...map.entries()].sort((x, y) => y[0].localeCompare(x[0]));
  }, [tab, approved, rejected]);

  const decisionsOfMonth = (key: string) => [...approved, ...rejected].filter((a) => monthKey(a) === key);

  return (
    <Shell>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 26, margin: 0 }}>Toifa arizalari</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>{waiting.length} ta ko'rib chiqilmagan ariza</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "btn btn-primary" : "btn btn-ghost"} onClick={() => setTab(t.key)}>
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {loading && <p className="muted">Yuklanmoqda…</p>}

      {!loading && tab === "WAITING" && (
        <>
          {waiting.length === 0 && <p className="muted">Kutayotgan ariza yo'q</p>}
          {waiting.map((a) => <AppRow key={a.id} app={a} onChanged={load} />)}
        </>
      )}

      {!loading && tab !== "WAITING" && (
        <>
          {months.length === 0 && <p className="muted">{tab === "APPROVED" ? "Tasdiqlangan ariza yo'q" : "Rad etilgan ariza yo'q"}</p>}
          {months.map(([key, list]) => (
            <MonthGroup key={key} label={monthLabel(key)} apps={list} monthApps={decisionsOfMonth(key)} onChanged={load} />
          ))}
        </>
      )}
    </Shell>
  );
}
