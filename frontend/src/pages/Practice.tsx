import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import type { PracticeTask, PracticeResource } from "../types";

// Ustozlik amaliyoti vazifalari — kategoriya bo'yicha guruhlanadi (Scratch, Python...).
// Har vazifada: Bajariladigan topshiriqlar (matn + video) va Kerakli resurslar (havolalar).

// Video havolasini <iframe> embed manziliga aylantiradi (YouTube/Vimeo).
// To'g'ridan video fayl (.mp4/.webm) bo'lsa — null qaytaradi (<video> ishlatiladi).
function toEmbed(raw: string): { embed: string | null; file: string | null } {
  const url = String(raw ?? "").trim();
  if (!url) return { embed: null, file: null };
  if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(url)) return { embed: null, file: url };
  // YouTube
  let m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (m) return { embed: `https://www.youtube.com/embed/${m[1]}`, file: null };
  // Vimeo
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { embed: `https://player.vimeo.com/video/${m[1]}`, file: null };
  // Boshqa — o'zini iframe'da ochamiz (Google Drive preview va h.k.)
  return { embed: url, file: null };
}

interface EditState {
  category: string;
  title: string;
  tasks: string;
  videoUrl: string;
  resources: PracticeResource[];
}
const emptyEdit = (): EditState => ({ category: "", title: "", tasks: "", videoUrl: "", resources: [] });

export default function Practice() {
  const { teacher } = useAuth();
  const isAdmin = teacher?.isAdmin === true;

  const [tasks, setTasks] = useState<PracticeTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditState>(emptyEdit());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ tasks: PracticeTask[] }>("/practice");
      setTasks(r.tasks);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setForm(emptyEdit());
    setShowAdd(true);
    setEditingId(null);
  }
  function openEdit(t: PracticeTask) {
    setForm({
      category: t.category, title: t.title, tasks: t.tasks,
      videoUrl: t.videoUrl ?? "", resources: t.resources.length ? t.resources : [],
    });
    setEditingId(t.id);
    setShowAdd(false);
  }
  function closeForm() { setShowAdd(false); setEditingId(null); setForm(emptyEdit()); }

  // Resurs qatorlari tahriri
  function setRes(i: number, patch: Partial<PracticeResource>) {
    setForm((f) => ({ ...f, resources: f.resources.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  }
  function addRes() { setForm((f) => ({ ...f, resources: [...f.resources, { label: "", url: "" }] })); }
  function removeRes(i: number) { setForm((f) => ({ ...f, resources: f.resources.filter((_, idx) => idx !== i) })); }

  async function save() {
    if (!form.category.trim() && !form.tasks.trim()) { showToast("Kategoriya va topshiriq kiriting"); return; }
    setSaving(true);
    const body = JSON.stringify({
      category: form.category.trim(),
      title: form.title.trim(),
      tasks: form.tasks.trim(),
      videoUrl: form.videoUrl.trim() || null,
      resources: form.resources.filter((r) => r.label.trim() || r.url.trim()),
    });
    try {
      if (editingId) await api(`/practice/${editingId}`, { method: "PUT", body });
      else await api("/practice", { method: "POST", body });
      await load();
      closeForm();
      showToast(editingId ? "✅ Saqlandi" : "✅ Qo'shildi");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Xatolik");
    } finally { setSaving(false); }
  }

  async function remove(t: PracticeTask) {
    if (!confirm("Bu vazifani o'chirishni tasdiqlaysizmi?")) return;
    try {
      await api(`/practice/${t.id}`, { method: "DELETE" });
      await load();
    } catch (e) { showToast(e instanceof Error ? e.message : "Xatolik"); }
  }

  // Kategoriya bo'yicha guruhlash (birinchi ko'rinish tartibida)
  const groups: { category: string; items: PracticeTask[] }[] = [];
  const gmap = new Map<string, PracticeTask[]>();
  for (const t of tasks) {
    const key = t.category || "Boshqa";
    if (!gmap.has(key)) { gmap.set(key, []); groups.push({ category: key, items: gmap.get(key)! }); }
    gmap.get(key)!.push(t);
  }

  return (
    <Shell>
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>Amaliyot dasturi</h1>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            Ustozlik amaliyoti uchun bajariladigan topshiriqlar va kerakli resurslar
          </p>
        </div>

        {loading ? (
          <div><div className="cur-skel" /><div className="cur-skel" /><div className="cur-skel" /></div>
        ) : (
          <>
            {tasks.length === 0 && !showAdd && (
              <div className="card" style={{ padding: "32px 24px", textAlign: "center" }}>
                <span className="material-symbols-outlined" style={{ fontSize: 44, color: "var(--muted)", display: "block", marginBottom: 10 }}>assignment</span>
                <p className="muted" style={{ margin: 0 }}>
                  Hali amaliyot vazifasi qo'shilmagan.{isAdmin && " Pastdagi tugma bilan qo'shing."}
                </p>
              </div>
            )}

            {groups.map((g) => (
              <div key={g.category} style={{ marginBottom: 26 }}>
                <div className="pt-cat">{g.category}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 14 }}>
                  {g.items.map((t, i) => {
                    const v = t.videoUrl ? toEmbed(t.videoUrl) : { embed: null, file: null };
                    return (
                      <div key={t.id} className="pt-card">
                        {t.title && <div className="pt-title">{t.title}</div>}

                        <div className="pt-label">Bajariladigan topshiriqlar</div>
                        <div className="pt-tasks">
                          <span className="pt-num">{i + 1}.</span>{" "}
                          {t.tasks || <span className="muted">—</span>}
                        </div>

                        {t.videoUrl && (
                          <div className="pt-video">
                            {v.file ? (
                              <video src={v.file} controls preload="metadata" />
                            ) : (
                              <iframe src={v.embed ?? ""} title={t.title || "video"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                            )}
                          </div>
                        )}

                        {t.resources.length > 0 && (
                          <>
                            <div className="pt-label">Kerakli resurslar</div>
                            <ul className="pt-res">
                              {t.resources.map((r, ri) => (
                                <li key={ri}>
                                  <span className="material-symbols-outlined">link</span>
                                  {r.url ? (
                                    <a href={r.url} target="_blank" rel="noopener noreferrer">{r.label || r.url}</a>
                                  ) : (
                                    <span>{r.label}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}

                        {isAdmin && (
                          <div className="pt-actions">
                            <button className="cur-mini-btn edit" onClick={() => openEdit(t)} title="Tahrirlash">
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
                            </button>
                            <button className="cur-mini-btn del" onClick={() => remove(t)} title="O'chirish">
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Admin: qo'shish / tahrirlash formasi */}
            {isAdmin && (showAdd || editingId) && (
              <div className="cur-form" style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>
                  {editingId ? "✏️ Vazifani tahrirlash" : "➕ Yangi amaliyot vazifasi"}
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <label className="f-label">Kategoriya * (guruh sarlavhasi)</label>
                      <input value={form.category} placeholder="Masalan: Scratch"
                        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
                    </div>
                    <div style={{ flex: 2, minWidth: 200 }}>
                      <label className="f-label">Qisqa nom (ixtiyoriy)</label>
                      <input value={form.title} placeholder="Masalan: Loop animatsiya"
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <label className="f-label">Bajariladigan topshiriqlar *</label>
                    <textarea rows={3} value={form.tasks} style={{ width: "100%" }}
                      placeholder="Videoda ko'rganingizdek loop animatsiya yarating. O'yin faylini .sb3 formatda yuboring."
                      onChange={(e) => setForm((f) => ({ ...f, tasks: e.target.value }))} />
                  </div>
                  <div>
                    <label className="f-label">Video havolasi (YouTube/Vimeo/.mp4 — ixtiyoriy)</label>
                    <input value={form.videoUrl} placeholder="https://youtu.be/..."
                      onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))} />
                  </div>
                  <div>
                    <label className="f-label">Kerakli resurslar (havolalar)</label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {form.resources.map((r, i) => (
                        <div key={i} style={{ display: "flex", gap: 6 }}>
                          <input style={{ flex: 1 }} value={r.label} placeholder="Nom (masalan: Scratch dasturi)"
                            onChange={(e) => setRes(i, { label: e.target.value })} />
                          <input style={{ flex: 1.4 }} value={r.url} placeholder="https://scratch.mit.edu"
                            onChange={(e) => setRes(i, { url: e.target.value })} />
                          <button className="cur-mini-btn del" onClick={() => removeRes(i)} title="O'chirish">
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                          </button>
                        </div>
                      ))}
                      <button className="btn btn-ghost" style={{ alignSelf: "flex-start", padding: "6px 12px", fontSize: 13 }} onClick={addRes}>
                        + Resurs qo'shish
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={save} disabled={saving}>
                      {saving ? "Saqlanmoqda…" : editingId ? "Saqlash" : "Qo'shish"}
                    </button>
                    <button className="btn btn-ghost" onClick={closeForm}>Bekor</button>
                  </div>
                </div>
              </div>
            )}

            {isAdmin && !showAdd && !editingId && (
              <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={openAdd}>
                + Amaliyot vazifasi qo'shish
              </button>
            )}
          </>
        )}

        {toast && <div className="cur-toast">{toast}</div>}
      </div>
    </Shell>
  );
}
