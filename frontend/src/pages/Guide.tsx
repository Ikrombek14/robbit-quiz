import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import Markdown from "../components/Markdown";

interface GuideSection {
  id: string;
  order: number;
  title: string;
  body: string;
  icon: string | null;
}

interface EditState {
  order: number;
  title: string;
  icon: string;
  body: string;
}

const EMPTY_EDIT: EditState = { order: 1, title: "", icon: "", body: "" };

export default function Guide() {
  const { teacher } = useAuth();
  const isAdmin = teacher?.isAdmin === true;

  const [sections, setSections] = useState<GuideSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  // Qo'shish / tahrirlash
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditState>(EMPTY_EDIT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ sections: GuideSection[] }>("/guide")
      .then((r) => setSections(r.sections))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function openAdd() {
    setForm({ ...EMPTY_EDIT, order: sections.length + 1 });
    setAdding(true);
    setEditingId(null);
  }

  function openEdit(s: GuideSection) {
    setForm({ order: s.order + 1, title: s.title, icon: s.icon ?? "", body: s.body });
    setEditingId(s.id);
    setAdding(false);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
  }

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const body = {
        order: form.order - 1,
        title: form.title.trim(),
        icon: form.icon.trim() || null,
        body: form.body,
      };
      if (editingId) {
        const r = await api<{ section: GuideSection }>(`/guide/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
        setSections((xs) => xs.map((x) => (x.id === editingId ? r.section : x)).sort((a, b) => a.order - b.order));
      } else {
        const r = await api<{ section: GuideSection }>("/guide", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setSections((xs) => [...xs, r.section].sort((a, b) => a.order - b.order));
      }
      cancel();
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: GuideSection) {
    if (!confirm(`"${s.title}" bo'limini o'chirishni tasdiqlaysizmi?`)) return;
    await api(`/guide/${s.id}`, { method: "DELETE" });
    setSections((xs) => xs.filter((x) => x.id !== s.id));
  }

  const btn: React.CSSProperties = {
    border: "none", cursor: "pointer", borderRadius: 8,
    display: "flex", alignItems: "center", gap: 4,
    padding: "6px 10px", fontSize: 13, fontWeight: 600,
  };

  // Tahrirlash / qo'shish formasi
  function renderForm() {
    return (
      <div style={{ padding: 16, background: "var(--surface-low)", borderRadius: 12, border: "2px solid var(--primary)", marginTop: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ width: 72 }}>
            <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>#</label>
            <input type="number" min={1} value={form.order} style={{ textAlign: "center" }}
              onChange={(e) => setForm((f) => ({ ...f, order: Number(e.target.value) }))} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>Bo'lim nomi *</label>
            <input value={form.title} autoFocus placeholder="Masalan: Darsga tayyorgarlik"
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div style={{ width: 160 }}>
            <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>Ikonka (ixtiyoriy)</label>
            <input value={form.icon} placeholder="masalan: menu_book"
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
          </div>
        </div>
        <label className="text-sm" style={{ fontWeight: 700, display: "block", marginBottom: 4 }}>Matn (Markdown)</label>
        <textarea value={form.body} rows={14}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          placeholder={"# Sarlavha\n\n- Ro'yxat elementi\n- Yana biri\n\n**Qalin** va [havola](https://...)"}
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "2px solid var(--border)", background: "var(--surface)", fontSize: 14, color: "var(--ink)", fontFamily: "ui-monospace, monospace", lineHeight: 1.6, resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button className="btn" onClick={save} disabled={saving || !form.title.trim()}>
            {saving ? "Saqlanmoqda…" : "Saqlash"}
          </button>
          <button className="btn btn-ghost" onClick={cancel}>Bekor</button>
        </div>
        {/* Jonli ko'rinish */}
        {form.body.trim() && (
          <div style={{ marginTop: 14 }}>
            <div className="muted text-sm" style={{ fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Ko'rinishi</div>
            <div style={{ padding: "8px 14px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <Markdown text={form.body} />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <Shell>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>Ustozlar yo'riqnomasi</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 24, fontSize: 15 }}>
          Robbit ustozlari uchun to'liq qo'llanma — bo'limlar bo'yicha
        </p>

        {loading ? (
          <p className="muted">Yuklanmoqda…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sections.length === 0 && !adding && (
              <div className="card" style={{ padding: "40px 24px", textAlign: "center" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--muted)", display: "block", marginBottom: 12 }}>menu_book</span>
                <p className="muted" style={{ margin: 0 }}>Hali bo'lim qo'shilmagan.</p>
              </div>
            )}

            {sections.map((s) => {
              const isOpen = openId === s.id;
              const isEditing = editingId === s.id;

              if (isEditing && isAdmin) return <div key={s.id}>{renderForm()}</div>;

              return (
                <div key={s.id} style={{ background: "var(--surface-low)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", cursor: "pointer" }}
                    onClick={() => setOpenId(isOpen ? null : s.id)}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: "var(--primary-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="material-symbols-outlined" style={{ color: "var(--primary)", fontSize: 22 }}>{s.icon || "description"}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 16 }}>{s.title}</div>
                    {isAdmin && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(s); }} title="Tahrirlash"
                          style={{ ...btn, background: "var(--primary-soft)", color: "var(--primary)" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); remove(s); }} title="O'chirish"
                          style={{ ...btn, background: "var(--error-container)", color: "var(--error)" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                        </button>
                      </>
                    )}
                    <span className="material-symbols-outlined" style={{ fontSize: 22, color: "var(--muted)", transition: "transform 0.15s", transform: isOpen ? "rotate(180deg)" : "none" }}>expand_more</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: "4px 18px 18px", borderTop: "1px solid var(--border)" }}>
                      {s.body.trim()
                        ? <Markdown text={s.body} />
                        : <p className="muted" style={{ fontStyle: "italic" }}>Bu bo'lim hali to'ldirilmagan.</p>}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Admin — qo'shish */}
            {isAdmin && (adding ? renderForm() : (
              <button className="btn btn-ghost" onClick={openAdd} style={{ marginTop: 4, alignSelf: "flex-start" }}>
                + Bo'lim qo'shish
              </button>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
