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

// Toifaga qarab badge tusi — jadval bir qarashda skanerlanadi (hammasi bir xil ko'k emas)
function catClass(c?: string | null): string {
  const s = String(c ?? "").trim();
  if (s === "1") return "cat-badge t1";
  if (s === "2") return "cat-badge t2";
  if (s === "3") return "cat-badge t3";
  return "cat-badge";
}

// Platformadan foydalanish holati: faol (o'yin o'tkazgan) / kirgan (akkaunt bor) / kirmagan
type PlatStatus = "faol" | "kirgan" | "yoq";
function platStatus(r: RosterTeacher): PlatStatus {
  if (!r.usage) return "yoq";
  return r.usage.games > 0 ? "faol" : "kirgan";
}
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("uz-UZ", { day: "numeric", month: "short" });

// Platforma holati badge'i (admin ustuni)
function PlatBadge({ r }: { r: RosterTeacher }) {
  const st = platStatus(r);
  if (st === "yoq") {
    return <span className="muted" title="Platformada akkaunt ochmagan">—</span>;
  }
  const u = r.usage!;
  if (st === "kirgan") {
    return (
      <span title={`${u.email} · ro'yxatdan o'tgan: ${fmtDate(u.registeredAt)} · ${u.quizzes} ta slayd, o'yin o'tkazmagan`}
        style={{
          fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap",
          background: "rgba(245,158,11,0.16)", color: "#d97706", border: "1px solid rgba(245,158,11,0.42)",
        }}>
        Kirgan
      </span>
    );
  }
  return (
    <span title={`${u.email} · ${u.games} ta o'yin, ${u.quizzes} ta slayd${u.lastGameAt ? ` · oxirgi o'yin: ${fmtDate(u.lastGameAt)}` : ""}`}
      style={{
        fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap",
        background: "rgba(34,197,94,0.14)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.38)",
      }}>
      ✓ {u.games} o'yin{u.lastGameAt ? ` · ${fmtDate(u.lastGameAt)}` : ""}
    </span>
  );
}

export default function Teachers() {
  const { teacher } = useAuth();
  // Roster mutatsiyalari (import/qo'shish/tahrir/o'chirish) — faqat super admin
  const isAdmin = teacher?.isSuperAdmin === true;
  // Toifa ustuni — maxfiy, faqat adminlarga ko'rinadi (backend ham oddiy ustozga yubormaydi)
  const showCategory = teacher?.isAdmin === true;

  const [rows, setRows] = useState<RosterTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("");
  const [plat, setPlat] = useState<"" | PlatStatus>(""); // platforma holati filtri (admin)
  const [msg, setMsg] = useState("");
  const [showNotJoined, setShowNotJoined] = useState(false); // "kirmagan" bo'limi ochiqmi (admin)

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
      if (plat && platStatus(r) !== plat) return false;
      if (needle && !`${r.name} ${r.username ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, branch, plat]);

  // Platforma xulosasi (faqat admin ko'radi — usage faqat unga keladi)
  const platCounts = useMemo(() => {
    const c = { faol: 0, kirgan: 0, yoq: 0 };
    for (const r of rows) c[platStatus(r)]++;
    return c;
  }, [rows]);

  // Platformaga hali kirmagan ustozlar — qidiruv + filial filtriga bo'ysunadi (plat filtriga emas),
  // shunda admin filial bo'yicha toraytira oladi. Follow-up (bog'lanish) uchun alohida bo'lim.
  const notJoined = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (platStatus(r) !== "yoq") return false;
      if (branch && r.branch !== branch) return false;
      if (needle && !`${r.name} ${r.username ?? ""}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, branch]);

  // Kirmaganlarning telefon raqamlarini nusxalash (ommaviy xabar yuborish uchun)
  async function copyNotJoinedPhones() {
    const phones = notJoined.map((r) => r.phone).filter(Boolean) as string[];
    if (phones.length === 0) { setMsg("Bu ro'yxatda telefon raqami yo'q"); setTimeout(() => setMsg(""), 4000); return; }
    try {
      await navigator.clipboard.writeText(phones.join("\n"));
      setMsg(`✅ ${phones.length} ta telefon raqami nusxalandi`);
    } catch {
      setMsg("Nusxalab bo'lmadi");
    }
    setTimeout(() => setMsg(""), 4000);
  }

  // Kirmaganlarni CSV qilib yuklab olish (mijoz tomonida — faqat shu ro'yxat)
  function exportNotJoined() {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Ism-familiya", "Filial", "Toifa", "Tel", "Username"];
    const lines = [header.join(",")];
    for (const r of notJoined) {
      lines.push([r.name, r.branch, r.category, r.phone, r.username].map(esc).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kirmagan-ustozlar.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

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
          <p className="muted" style={{ marginTop: 0 }}>
            Rasmiy ustozlar ro'yxati · {rows.length} ta
            {/* Platforma xulosasi — usage faqat adminga keladi */}
            {showCategory && rows.length > 0 && (
              <> · <span style={{ color: "#16a34a", fontWeight: 700 }}>{platCounts.faol} faol</span>
                {" · "}<span style={{ color: "#d97706", fontWeight: 700 }}>{platCounts.kirgan} kirgan</span>
                {" · "}{platCounts.yoq} kirmagan</>
            )}
          </p>
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

      {/* Platformaga hali kirmagan ustozlar — faqat admin (usage faqat unga keladi).
          Bog'lanish (follow-up) uchun aloqa ma'lumotlari bilan alohida yig'ilgan bo'lim. */}
      {showCategory && notJoined.length > 0 && (
        <div className="nj-panel" style={{ marginTop: 16 }}>
          <button className="nj-header" onClick={() => setShowNotJoined((v) => !v)} aria-expanded={showNotJoined}>
            <span className="material-symbols-outlined" style={{ color: "#d97706" }}>person_off</span>
            <span style={{ fontWeight: 800, fontSize: 15 }}>Platformaga hali kirmagan ustozlar</span>
            <span className="nj-count">{notJoined.length}</span>
            {branch && <span className="muted text-sm">· {branch}</span>}
            <span style={{ flex: 1 }} />
            <span className="material-symbols-outlined nj-chevron" style={{ transform: showNotJoined ? "rotate(180deg)" : "none" }}>expand_more</span>
          </button>

          {showNotJoined && (
            <div className="nj-body">
              <div className="nj-actions">
                <p className="muted text-sm" style={{ margin: 0, flex: 1, minWidth: 200 }}>
                  Bu ustozlar hali akkaunt ochmagan. Ularga bog'lanib platformaga taklif qiling.
                </p>
                <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={copyNotJoinedPhones}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>content_copy</span>
                  Telefonlarni nusxalash
                </button>
                <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={exportNotJoined}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>download</span>
                  CSV
                </button>
              </div>
              <div className="nj-grid">
                {notJoined.map((r) => (
                  <div className="nj-card" key={r.id}>
                    <div className="nj-card-top">
                      <span className="side-avatar" style={{ width: 34, height: 34, fontSize: 14, flexShrink: 0 }}>
                        {(r.name[0] ?? "?").toUpperCase()}
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                        {r.username && <div className="muted text-sm" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.username}</div>}
                      </div>
                      {isAdmin && (
                        <button className="icon-btn" title="Tahrirlash" onClick={() => openEdit(r)} style={{ width: 32, height: 32, flexShrink: 0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                        </button>
                      )}
                    </div>
                    <div className="nj-tags">
                      {r.branch && <span className="cat-badge alt">{r.branch}</span>}
                      {catLabel(r.category) && <span className={catClass(r.category)}>{catLabel(r.category)}</span>}
                    </div>
                    {r.phone ? (
                      <a className="nj-phone" href={`tel:${String(r.phone).replace(/\s+/g, "")}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>call</span>
                        {r.phone}
                      </a>
                    ) : (
                      <span className="muted text-sm">☎ Telefon yo'q</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
        {/* Platforma holati filtri — faqat admin (usage faqat unga keladi) */}
        {showCategory && (
          <div className="chip-row">
            <button className={`chip ${plat === "" ? "on" : ""}`} onClick={() => setPlat("")}>Barchasi</button>
            <button className={`chip ${plat === "faol" ? "on" : ""}`} onClick={() => setPlat("faol")}>🎮 Faol ({platCounts.faol})</button>
            <button className={`chip ${plat === "kirgan" ? "on" : ""}`} onClick={() => setPlat("kirgan")}>Kirgan ({platCounts.kirgan})</button>
            <button className={`chip ${plat === "yoq" ? "on" : ""}`} onClick={() => setPlat("yoq")}>Kirmagan ({platCounts.yoq})</button>
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
          <div className={`roster-row roster-head ${showCategory ? "with-usage" : "no-cat"}`}>
            <span>#</span>
            <span>Ism-familiya</span>
            {showCategory && <span>Toifa</span>}
            <span>Filial</span>
            {showCategory && <span>Platforma</span>}
            {isAdmin && <span style={{ textAlign: "right" }}>Amallar</span>}
          </div>
          {filtered.map((r, i) => (
            <div className={`roster-row ${showCategory ? "with-usage" : "no-cat"}`} key={r.id}>
              <span className="muted">{i + 1}</span>
              <span className="roster-name">
                <span className="side-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>{(r.name[0] ?? "?").toUpperCase()}</span>
                <span>{r.name}{r.username ? <span className="muted text-sm"> · {r.username}</span> : null}</span>
              </span>
              {showCategory && <span>{catLabel(r.category) && <span className={catClass(r.category)}>{catLabel(r.category)}</span>}</span>}
              <span>{r.branch ? <span className="cat-badge alt">{r.branch}</span> : <span className="muted">—</span>}</span>
              {showCategory && <span><PlatBadge r={r} /></span>}
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
