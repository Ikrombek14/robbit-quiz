import { useEffect, useMemo, useRef, useState } from "react";
import { api, getToken } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import type { RosterTeacher } from "../types";

const empty = (): Partial<RosterTeacher> => ({ name: "", branch: "", category: "", phone: "", username: "", status: "" });

function catLabel(c?: string | null): string {
  const s = String(c ?? "").trim();
  if (!s) return "";
  return /^\d+$/.test(s) ? `${s}-toifa` : s;
}

export default function Teachers() {
  const { teacher } = useAuth();
  const isAdmin = teacher?.isAdmin === true;

  const [rows, setRows] = useState<RosterTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [msg, setMsg] = useState("");

  // qo'shish/tahrirlash modal
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<RosterTeacher>>(empty());
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api<{ teachers: RosterTeacher[] }>("/teachers");
      setRows(r.teachers);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const branches = useMemo(() => [...new Set(rows.map((r) => r.branch).filter(Boolean))] as string[], [rows]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (branch && r.branch !== branch) return false;
      if (needle && !`${r.name} ${r.username ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, branch]);

  // ---- Import ----
  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!f) return;
    setMsg("Import qilinmoqda…");
    try {
      const fd = new FormData();
      fd.append("file", f, f.name);
      const r = await api<{ summary: { added: number; updated: number; skipped: number } }>("/teachers/import", { method: "POST", body: fd });
      setMsg(`✅ Import: ${r.summary.added} yangi, ${r.summary.updated} yangilandi${r.summary.skipped ? `, ${r.summary.skipped} o'tkazildi` : ""}`);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Import xatosi");
    }
    setTimeout(() => setMsg(""), 6000);
  }

  // ---- Export (auth bilan blob yuklab olish) ----
  async function onExport() {
    const res = await fetch("/api/teachers/export", { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) { setMsg("Eksport xatosi"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ustozlar.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- CRUD ----
  function openAdd() { setEditId(null); setForm(empty()); setEditOpen(true); }
  function openEdit(r: RosterTeacher) { setEditId(r.id); setForm({ ...r }); setEditOpen(true); }

  async function saveForm() {
    if (!String(form.name ?? "").trim()) return;
    setSaving(true);
    try {
      const body = {
        name: form.name, branch: form.branch || null, category: form.category || null,
        phone: form.phone || null, username: form.username || null, status: form.status || null,
      };
      if (editId) await api(`/teachers/${editId}`, { method: "PUT", body: JSON.stringify(body) });
      else await api("/teachers", { method: "POST", body: JSON.stringify(body) });
      setEditOpen(false);
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Saqlash xatosi");
    } finally {
      setSaving(false);
    }
  }

  async function remove(r: RosterTeacher) {
    if (!confirm(`"${r.name}" o'chirilsinmi?`)) return;
    await api(`/teachers/${r.id}`, { method: "DELETE" });
    setRows((rs) => rs.filter((x) => x.id !== r.id));
  }

  return (
    <Shell>
      <div className="between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 2 }}>O'qituvchilar</h1>
          <p className="muted" style={{ marginTop: 0 }}>Rasmiy ustozlar ro'yxati · {rows.length} ta</p>
        </div>
        {isAdmin && (
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input ref={fileRef} type="file" accept=".csv,text/csv,.xlsx" onChange={onImport} style={{ display: "none" }} />
            <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
              <span className="material-symbols-outlined">upload_file</span> Import (CSV)
            </button>
            <button className="btn btn-ghost" onClick={onExport}>
              <span className="material-symbols-outlined">download</span> Export
            </button>
            <button className="btn" onClick={openAdd}>
              <span className="material-symbols-outlined">add</span> Qo'shish
            </button>
          </div>
        )}
      </div>

      {msg && <div className="import-progress" style={{ marginTop: 12 }}>{msg}</div>}

      {/* Filtrlar */}
      <div className="filter-bar">
        <input className="filter-search" placeholder="🔍 Ism bo'yicha…" value={q} onChange={(e) => setQ(e.target.value)} />
        {branches.length > 0 && (
          <div className="chip-row">
            <button className={`chip ${branch === "" ? "on" : ""}`} onClick={() => setBranch("")}>Barcha filial</button>
            {branches.map((b) => (
              <button key={b} className={`chip ${branch === b ? "on" : ""}`} onClick={() => setBranch(b)}>{b}</button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : filtered.length === 0 ? (
        <div className="card">
          <p className="muted">{rows.length === 0 ? (isAdmin ? "Ro'yxat bo'sh. CSV import qiling." : "Ro'yxat hali to'ldirilmagan.") : "Topilmadi."}</p>
        </div>
      ) : (
        <div className="roster-table">
          <div className="roster-row roster-head">
            <span>#</span>
            <span>Ism-familiya</span>
            <span>Toifa</span>
            <span>Filial</span>
            {isAdmin && <span style={{ textAlign: "right" }}>Amallar</span>}
          </div>
          {filtered.map((r, i) => (
            <div className="roster-row" key={r.id}>
              <span className="muted">{i + 1}</span>
              <span className="roster-name">
                <span className="side-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>{(r.name[0] ?? "?").toUpperCase()}</span>
                <span>{r.name}{r.username ? <span className="muted text-sm"> · {r.username}</span> : null}</span>
              </span>
              <span>{catLabel(r.category) && <span className="cat-badge">{catLabel(r.category)}</span>}</span>
              <span>{r.branch ? <span className="cat-badge alt">{r.branch}</span> : <span className="muted">—</span>}</span>
              {isAdmin && (
                <span className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                  <button className="icon-btn" title="Tahrirlash" onClick={() => openEdit(r)} style={{ width: 36, height: 36 }}>
                    <span className="material-symbols-outlined">edit</span>
                  </button>
                  <button className="icon-btn" title="O'chirish" onClick={() => remove(r)} style={{ width: 36, height: 36 }}>
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Qo'shish/tahrirlash modal */}
      {editOpen && (
        <div className="modal-overlay" onClick={() => setEditOpen(false)}>
          <div className="card card-narrow" onClick={(e) => e.stopPropagation()}>
            <div className="between">
              <h3 style={{ margin: 0 }}>{editId ? "Tahrirlash" : "Yangi ustoz"}</h3>
              <button className="btn btn-ghost" onClick={() => setEditOpen(false)}>✕</button>
            </div>
            <div className="spacer" />
            <label>Ism-familiya</label>
            <input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bobonova Gulnoza" />
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label>Filial</label>
                <input value={form.branch ?? ""} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Toifa</label>
                <input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="1 / 2 / 3" />
              </div>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label>Telefon</label>
                <input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label>Username</label>
                <input value={form.username ?? ""} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="@username" />
              </div>
            </div>
            <div className="spacer" />
            <button className="btn btn-block" disabled={saving || !String(form.name ?? "").trim()} onClick={saveForm}>
              {saving ? "Saqlanmoqda…" : "Saqlash"}
            </button>
          </div>
        </div>
      )}
    </Shell>
  );
}
