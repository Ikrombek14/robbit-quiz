import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import type { AppUser } from "../types";

// Ustoz huquqining manbasini tushuntiruvchi yorliq
function accessSource(u: AppUser): string {
  if (u.accessOverride === true) return "Qo'lda berilgan";
  if (u.accessOverride === false) return "Qo'lda olib tashlangan";
  if (u.envAdmin) return "Admin (avto)";
  return u.approved ? "Ro'yxatda (avto)" : "Ro'yxatda yo'q";
}

export default function Users() {
  const { teacher: me } = useAuth();
  const isSuper = me?.isSuperAdmin === true; // super admin: admin huquqi, parol, ustoz huquqi
  // Oddiy admin faqat "slayd ruxsati"ni boshqaradi; super admin uchun barcha ustunlar.
  const cols = isSuper ? "28px 1fr 150px 190px 150px" : "28px 1fr 1fr";
  const [rows, setRows] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "approved" | "pending" | "admin">("all");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // patch ketayotgan user id

  async function load() {
    setLoading(true);
    try {
      const r = await api<{ users: AppUser[] }>("/admin/users");
      setRows(r.users);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((u) => {
      if (filter === "approved" && !u.approved) return false;
      if (filter === "pending" && u.approved) return false;
      if (filter === "admin" && !u.isAdmin) return false;
      if (needle && !`${u.name} ${u.email}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, filter]);

  async function resetPassword(u: AppUser) {
    const pw = window.prompt(`"${u.name}" uchun yangi parol kiriting (kamida 6 belgi):`);
    if (pw === null) return; // bekor qilindi
    if (pw.length < 6) {
      setMsg("Parol kamida 6 belgi bo'lishi kerak");
      setTimeout(() => setMsg(""), 4000);
      return;
    }
    setBusy(u.id);
    setMsg("");
    try {
      await api(`/admin/users/${u.id}/password`, {
        method: "POST",
        body: JSON.stringify({ password: pw }),
      });
      setMsg(`✓ "${u.name}" paroli yangilandi`);
      setTimeout(() => setMsg(""), 5000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Xatolik");
      setTimeout(() => setMsg(""), 5000);
    } finally {
      setBusy(null);
    }
  }

  // Foydalanuvchini o'chirish — faqat super admin. Loyihalari ham o'chadi,
  // shuning uchun tasdiqda soni ko'rsatiladi.
  async function removeUser(u: AppUser) {
    const extra = u.quizCount > 0 ? `\n\nDIQQAT: ${u.quizCount} ta loyihasi ham o'chadi!` : "";
    if (!confirm(`"${u.name}" (${u.email}) accountini o'chirishni tasdiqlaysizmi?${extra}`)) return;
    setBusy(u.id);
    setMsg("");
    try {
      await api(`/admin/users/${u.id}`, { method: "DELETE" });
      setRows((rs) => rs.filter((x) => x.id !== u.id));
      setMsg(`🗑️ "${u.name}" o'chirildi`);
      setTimeout(() => setMsg(""), 5000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "O'chirishda xatolik");
      setTimeout(() => setMsg(""), 5000);
    } finally {
      setBusy(null);
    }
  }

  // Ustozlik so'rovini tasdiqlash/rad etish (har qanday admin)
  async function resolveRequest(u: AppUser, approve: boolean) {
    if (!approve && !confirm(`"${u.name}" so'rovini rad etishni tasdiqlaysizmi?`)) return;
    setBusy(u.id);
    setMsg("");
    try {
      const r = await api<{ user: AppUser }>(`/admin/users/${u.id}/teacher-request`, {
        method: "POST",
        body: JSON.stringify({ approve }),
      });
      setRows((rs) => rs.map((x) => (x.id === u.id ? r.user : x)));
      setMsg(approve ? `✓ "${u.name}" ustoz qilindi` : `"${u.name}" so'rovi rad etildi`);
      setTimeout(() => setMsg(""), 5000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Xatolik");
      setTimeout(() => setMsg(""), 5000);
    } finally {
      setBusy(null);
    }
  }

  async function patch(u: AppUser, body: { accessOverride?: boolean | null; isAdmin?: boolean; canCreate?: boolean }) {
    setBusy(u.id);
    setMsg("");
    try {
      const r = await api<{ user: AppUser }>(`/admin/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setRows((rs) => rs.map((x) => (x.id === u.id ? r.user : x)));
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Xatolik");
      setTimeout(() => setMsg(""), 5000);
    } finally {
      setBusy(null);
    }
  }

  const counts = useMemo(() => ({
    all: rows.length,
    approved: rows.filter((u) => u.approved).length,
    admin: rows.filter((u) => u.isAdmin).length,
  }), [rows]);

  // Dublikat akkauntlar: bir xil ism bilan bir nechta account (odatda emaildagi
  // xato tufayli, masalan gmail.com / gmai.com) — adminga ogohlantirib ko'rsatamiz
  const dupNames = useMemo(() => {
    const seen = new Map<string, number>();
    rows.forEach((u) => {
      const k = u.name.trim().toLowerCase().replace(/\s+/g, " ");
      seen.set(k, (seen.get(k) ?? 0) + 1);
    });
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));
  }, [rows]);
  const isDup = (u: AppUser) => dupNames.has(u.name.trim().toLowerCase().replace(/\s+/g, " "));

  return (
    <Shell>
      <div className="between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, marginBottom: 2 }}>Foydalanuvchilar</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Saytga kirgan accountlar · {counts.all} ta · {counts.approved} ustoz · {counts.admin} admin
            <span className="text-sm"> · o'quvchilar bu ro'yxatda ko'rsatilmaydi</span>
          </p>
        </div>
      </div>

      {msg && <div className="import-progress" style={{ marginTop: 12 }}>{msg}</div>}

      {/* Ustozlik so'rovlari — o'quvchi sahifasidan yuborilgan, admin javobini kutmoqda */}
      {(() => {
        const requests = rows.filter((u) => u.teacherRequestAt);
        if (requests.length === 0) return null;
        return (
          <div className="card" style={{ marginTop: 12, border: "2px solid var(--tertiary, #f0c419)" }}>
            <h3 style={{ marginTop: 0 }}>🎓 Ustozlik so'rovlari ({requests.length})</h3>
            {requests.map((u) => (
              <div key={u.id} className="between" style={{ padding: "8px 0", gap: 10, flexWrap: "wrap" }}>
                <span className="roster-name">
                  <span className="side-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>
                    {(u.name[0] ?? "?").toUpperCase()}
                  </span>
                  <span>
                    <span>{u.teacherRequestName ?? u.name}</span>
                    <span className="muted text-sm" style={{ display: "block" }}>
                      {u.email} · {u.teacherRequestAt ? new Date(u.teacherRequestAt).toLocaleDateString("uz-UZ") : ""}
                    </span>
                  </span>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <button className="btn" disabled={busy === u.id} onClick={() => resolveRequest(u, true)}>
                    {busy === u.id ? "…" : "✓ Tasdiqlash"}
                  </button>
                  <button className="btn btn-ghost" disabled={busy === u.id} onClick={() => resolveRequest(u, false)}>
                    Rad etish
                  </button>
                </span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Filtrlar */}
      <div className="filter-bar">
        <input className="filter-search" placeholder="🔍 Ism yoki email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chip-row">
          <button className={`chip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>Barchasi</button>
          <button className={`chip ${filter === "approved" ? "on" : ""}`} onClick={() => setFilter("approved")}>Ustozlar</button>
          <button className={`chip ${filter === "pending" ? "on" : ""}`} onClick={() => setFilter("pending")}>Huquqsiz</button>
          <button className={`chip ${filter === "admin" ? "on" : ""}`} onClick={() => setFilter("admin")}>Adminlar</button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Yuklanmoqda…</p>
      ) : filtered.length === 0 ? (
        <div className="card"><p className="muted">Topilmadi.</p></div>
      ) : (
        <div className="roster-table">
          <div className="roster-row roster-head" style={{ gridTemplateColumns: cols }}>
            <span>#</span>
            <span>Foydalanuvchi</span>
            <span title="Slayd (loyiha) yaratish va tahrirlash ruxsati">Slayd ruxsati</span>
            {isSuper && <span title="O'quv dastur va Yo'riqnoma bo'limlariga kirish huquqi">Ustoz huquqi</span>}
            {isSuper && <span style={{ textAlign: "right" }} title="Parolni tiklash va admin huquqini boshqarish">Amallar</span>}
          </div>
          {filtered.map((u, i) => {
            const isMe = u.id === me?.id;
            const working = busy === u.id;
            return (
              <div className="roster-row" key={u.id} style={{ gridTemplateColumns: cols, alignItems: "center" }}>
                <span className="muted">{i + 1}</span>
                <span className="roster-name">
                  <span className="side-avatar" style={{ width: 32, height: 32, fontSize: 13 }}>
                    {(u.name[0] ?? "?").toUpperCase()}
                  </span>
                  <span style={{ overflow: "hidden" }}>
                    <span>
                      {u.name}{isMe ? <span className="muted text-sm"> (siz)</span> : null}
                      {isDup(u) && (
                        <span className="cat-badge t2" style={{ marginLeft: 6, fontSize: 11 }}
                          title="Bu ism bilan bir nechta account bor — email xato yozilgan bo'lishi mumkin">
                          ⚠ dublikat
                        </span>
                      )}
                    </span>
                    <span className="muted text-sm" style={{ display: "block" }}>{u.email}</span>
                  </span>
                </span>

                {/* Slayd qilish ruxsati — har qanday admin boshqaradi.
                    Berilgan = yashil holat (hover'da qizil — bosish olib tashlaydi). */}
                <span>
                  <button
                    className={`grant-btn ${u.canCreate ? "on" : ""}`}
                    disabled={working}
                    onClick={() => patch(u, { canCreate: !u.canCreate })}
                    title={u.canCreate ? "Bosilsa: slayd ruxsati olib tashlanadi" : "Bosilsa: slayd ruxsati beriladi"}
                  >
                    {working ? "…" : u.canCreate ? "✓ Slaydchi" : "+ Ruxsat berish"}
                  </button>
                </span>

                {/* Ustoz huquqi + Parol/Admin — faqat super admin */}
                {isSuper && (
                <>
                <span>
                  <button
                    className={`grant-btn ${u.approved ? "on" : ""}`}
                    disabled={working}
                    onClick={() => patch(u, { accessOverride: u.approved ? false : true })}
                    title={u.approved ? "Bosilsa: ustoz huquqi olib tashlanadi" : "Bosilsa: ustoz huquqi beriladi"}
                  >
                    {working ? "…" : u.approved ? "✓ Ustoz" : "+ Berish"}
                  </button>
                  <span className="muted text-sm" style={{ display: "block", marginTop: 2 }}>
                    {accessSource(u)}
                    {u.accessOverride !== null && (
                      <button
                        style={{
                          marginLeft: 6, background: "none", border: "none", padding: 0,
                          color: "var(--olive)", cursor: "pointer", font: "inherit", textDecoration: "underline",
                        }}
                        disabled={working}
                        onClick={() => patch(u, { accessOverride: null })}
                        title="Avtomatik (ro'yxat bo'yicha) holatga qaytarish"
                      >
                        avto
                      </button>
                    )}
                  </span>
                </span>

                {/* Parol tiklash + Admin */}
                <span className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                  <button
                    className="icon-btn"
                    style={{ width: 40, height: 36 }}
                    disabled={working}
                    onClick={() => resetPassword(u)}
                    title="Parolni tiklash (yangi parol o'rnatish)"
                  >
                    <span className="material-symbols-outlined">key</span>
                  </button>
                  <button
                    className="icon-btn"
                    style={{
                      width: 40, height: 36,
                      opacity: u.envAdmin || isMe ? 0.5 : 1,
                      background: u.isAdmin ? "var(--olive)" : undefined,
                      color: u.isAdmin ? "var(--on-olive)" : undefined,
                    }}
                    disabled={working || u.envAdmin || isMe}
                    onClick={() => patch(u, { isAdmin: !u.isAdmin })}
                    title={
                      u.envAdmin ? "ADMIN_EMAILS ro'yxatidagi admin — o'zgartirib bo'lmaydi"
                        : isMe ? "O'zingizning admin huquqingizni o'zgartira olmaysiz"
                        : u.isAdmin ? "Admin huquqini olib tashlash" : "Admin huquqini berish"
                    }
                  >
                    <span className="material-symbols-outlined">
                      {u.isAdmin ? "shield_person" : "shield"}
                    </span>
                  </button>
                  <button
                    className="row-action danger"
                    style={{ width: 40, height: 36, borderRadius: 10 }}
                    disabled={working || u.envAdmin || isMe}
                    onClick={() => removeUser(u)}
                    title={
                      u.envAdmin ? "ADMIN_EMAILS ro'yxatidagi accountni o'chirib bo'lmaydi"
                        : isMe ? "O'zingizni o'chira olmaysiz"
                        : "Accountni o'chirish (loyihalari bilan)"
                    }
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
                  </button>
                </span>
                </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
