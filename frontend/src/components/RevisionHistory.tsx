import { useEffect, useState } from "react";
import { api } from "../api";

// Quiz versiyalar tarixi (oxirgi 20 ta) — muharrir, Claude (MCP) yoki tiklash oldidagi holatlar.
// "Shu versiyaga qaytarish" — faqat quiz egasi va admin. Qaytarishning o'zi ham yangi versiya
// bo'ladi, shuning uchun tiklashni ham orqaga qaytarish mumkin.

interface Revision {
  id: string;
  version: number;
  source: "editor" | "mcp" | "restore";
  actorName: string | null;
  summary: string | null;
  createdAt: string;
  title: string;
  slideCount: number;
}

const SOURCE_LABEL: Record<Revision["source"], string> = {
  editor: "✏️ Muharrir",
  mcp: "🤖 Claude (MCP)",
  restore: "↩️ Tiklash",
};

export default function RevisionHistory({ quizId, onClose }: { quizId: string; onClose: () => void }) {
  const [revs, setRevs] = useState<Revision[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api<{ revisions: Revision[] }>(`/quizzes/${quizId}/revisions`)
      .then((r) => setRevs(r.revisions))
      .catch((e) => setErr(e instanceof Error ? e.message : "Xatolik"));
  }, [quizId]);

  async function restore(r: Revision) {
    const when = new Date(r.createdAt).toLocaleString("uz-UZ");
    if (!confirm(`Quizni ${when} dagi holatiga (${r.slideCount} ta slayd) qaytarasizmi?\n\nHozirgi holat ham tarixga yoziladi — kerak bo'lsa uni ham qaytarish mumkin. Saqlanmagan o'zgarishlaringiz yo'qoladi.`)) return;
    setBusy(r.id);
    setErr("");
    try {
      await api(`/quizzes/${quizId}/revisions/${r.id}/restore`, { method: "POST" });
      window.location.reload(); // muharrir yangi holat va versiya bilan qayta ochiladi
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Xatolik");
      setBusy(null);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={onClose}
    >
      <div className="card" style={{ maxWidth: 620, width: "100%", maxHeight: "80vh", overflow: "auto", margin: 0 }} onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ alignItems: "flex-start" }}>
          <div>
            <h3 style={{ margin: 0 }}>🕘 Versiyalar tarixi</h3>
            <p className="muted text-sm" style={{ margin: "4px 0 0" }}>
              Har bir saqlashdan oldingi holat (oxirgi 20 ta). O'chirilgan slaydni ham shu yerdan qaytarish mumkin.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} title="Yopish">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {revs === null && !err && <p className="muted text-sm">Yuklanmoqda…</p>}
          {revs?.length === 0 && <p className="muted text-sm">Hali tarix yo'q — quiz birinchi marta saqlangandan keyin paydo bo'ladi.</p>}
          {revs?.map((r) => (
            <div key={r.id} className="between" style={{ gap: 10, alignItems: "flex-start", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 12 }}>
              <div style={{ minWidth: 0 }}>
                <b>{new Date(r.createdAt).toLocaleString("uz-UZ", { dateStyle: "medium", timeStyle: "short" })}</b>
                <span className="muted text-sm"> · {SOURCE_LABEL[r.source] ?? r.source}{r.actorName ? ` · ${r.actorName}` : ""}</span>
                <div className="text-sm" style={{ marginTop: 2 }}>{r.summary}</div>
                <div className="muted text-sm" style={{ marginTop: 2 }}>Shu holatda: «{r.title}», {r.slideCount} ta slayd</div>
              </div>
              <button className="btn btn-ghost" style={{ flexShrink: 0, padding: "6px 12px", fontSize: 14 }} disabled={busy !== null} onClick={() => restore(r)}>
                {busy === r.id ? "…" : "Shu holatga qaytarish"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
