import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

// ---- Ism o'xshashligi (ro'yxatga biriktirish takliflari uchun) ----
// Backend nameKey bilan bir xil normalizatsiya: kichik harf, apostrof variantlari
// birlashadi, so'zlar alifbo tartibida (ism/familiya tartibi farq qilmasin)
function normName(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[`'']/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

// Levenshtein masofasi — "1 harf farqi", "o'/g' tushib qolgan" holatlarni topadi
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// 0..1 oralig'ida o'xshashlik: 1 = aynan bir xil (normalizatsiyadan keyin)
function nameSim(a: string, b: string): number {
  const x = normName(a), y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  return 1 - lev(x, y) / Math.max(x.length, y.length);
}

interface RosterItem {
  id: string;
  name: string;
  branch?: string | null;
}

export default function Users() {
  const navigate = useNavigate();
  const { teacher: me } = useAuth();
  const isSuper = me?.isSuperAdmin === true; // super admin: admin huquqi, parol, ustoz huquqi
  // Oddiy admin "slayd ruxsati" + "ofis admin"ni boshqaradi; super admin uchun barcha ustunlar.
  const cols = isSuper ? "28px 1fr 150px 150px 170px 150px" : "28px 1fr 1fr 1fr";
  const [rows, setRows] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "approved" | "pending" | "admin">("all");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // patch ketayotgan user id
  // Ro'yxatga biriktirish oynasi
  const [bindUser, setBindUser] = useState<AppUser | null>(null);
  const [roster, setRoster] = useState<RosterItem[] | null>(null); // null = hali yuklanmagan
  const [bindQ, setBindQ] = useState("");
  // Statistika (Google Sheet) nomini qo'lda biriktirish oynasi
  const [statsUser, setStatsUser] = useState<AppUser | null>(null);
  const [statNames, setStatNames] = useState<string[] | null>(null); // null = hali yuklanmagan
  const [statQ, setStatQ] = useState("");

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

  // Biriktirish oynasini ochish — roster ro'yxati birinchi ochilishda yuklanadi
  async function openBind(u: AppUser) {
    setBindUser(u);
    setBindQ("");
    if (roster === null) {
      try {
        const r = await api<{ teachers: RosterItem[] }>("/teachers");
        setRoster(r.teachers);
      } catch {
        setRoster([]);
      }
    }
  }

  // Foydalanuvchini tanlangan roster ustoziga biriktirish.
  // DIQQAT: account ismi ro'yxatdagi imlo bilan almashadi — moslik shu orqali tiklanadi.
  async function bindToRoster(u: AppUser, r: RosterItem) {
    if (!confirm(
      `"${u.name}" accountini ro'yxatdagi "${r.name}" ustoziga biriktirasizmi?\n\n` +
      `Account ismi "${r.name}" deb o'zgaradi — shunda ustoz huquqi va statistika avtomatik bog'lanadi.`,
    )) return;
    setBusy(u.id);
    setMsg("");
    try {
      const resp = await api<{ user: AppUser }>(`/admin/users/${u.id}/bind-roster`, {
        method: "POST",
        body: JSON.stringify({ rosterId: r.id }),
      });
      setRows((rs) => rs.map((x) => (x.id === u.id ? resp.user : x)));
      setBindUser(null);
      setMsg(`🔗 "${resp.user.name}" ro'yxatga biriktirildi`);
      setTimeout(() => setMsg(""), 5000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Biriktirishda xatolik");
      setTimeout(() => setMsg(""), 6000);
    } finally {
      setBusy(null);
    }
  }

  // Statistika nomini biriktirish oynasini ochish — Sheet nomlari birinchi ochilishda yuklanadi
  async function openStats(u: AppUser) {
    setStatsUser(u);
    setStatQ("");
    if (statNames === null) {
      try {
        const r = await api<{ stats: { name: string }[] }>("/stats/all");
        setStatNames(r.stats.map((s) => s.name).filter(Boolean).sort((a, b) => a.localeCompare(b)));
      } catch {
        setStatNames([]);
      }
    }
  }

  // Statistika nomini saqlash/bekor qilish. Account ismiga TEGILMAYDI —
  // faqat statistika/tahlil shu nom bo'yicha olinadi.
  async function setStatsName(u: AppUser, statsName: string | null) {
    setBusy(u.id);
    setMsg("");
    try {
      const resp = await api<{ user: AppUser }>(`/admin/users/${u.id}/stats-name`, {
        method: "POST",
        body: JSON.stringify({ statsName }),
      });
      setRows((rs) => rs.map((x) => (x.id === u.id ? resp.user : x)));
      setStatsUser(null);
      setMsg(statsName ? `📊 "${u.name}" → statistika "${statsName}" ga biriktirildi` : `📊 "${u.name}" statistika biriktiruvi bekor qilindi`);
      setTimeout(() => setMsg(""), 5000);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Biriktirishda xatolik");
      setTimeout(() => setMsg(""), 6000);
    } finally {
      setBusy(null);
    }
  }

  async function patch(u: AppUser, body: { accessOverride?: boolean | null; isAdmin?: boolean; canCreate?: boolean; officeAdmin?: boolean }) {
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
            <span title="Ofis/qabul admini — faqat Yo'l xaritasi va Yo'riqnomani ko'radi (ustoz emas)">Ofis admin</span>
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
                    <span style={{ display: "flex", gap: 10, marginTop: 2, flexWrap: "wrap" }}>
                      {/* Roster bilan ism mos kelmagan foydalanuvchini qo'lda biriktirish */}
                      {!u.approved && !u.isAdmin && (
                        <button
                          style={{
                            background: "none", border: "none", padding: 0,
                            color: "var(--primary)", cursor: "pointer", fontSize: 13, textDecoration: "underline",
                          }}
                          disabled={working}
                          onClick={() => openBind(u)}
                          title="Ro'yxatdagi ustozga biriktirish — ism imlosi farq qilsa ham statistika bog'lanadi"
                        >
                          🔗 Ro'yxatga biriktirish
                        </button>
                      )}
                      {/* Istalgan ustozning Sheets'dan olinadigan faoliyat tahliliga otish */}
                      <button
                        style={{
                          background: "none", border: "none", padding: 0,
                          color: "var(--primary)", cursor: "pointer", fontSize: 13, textDecoration: "underline",
                        }}
                        onClick={() => navigate(`/stats/tahlil?q=${encodeURIComponent(u.name)}`)}
                        title="Bu ustozning Sheets'dagi faoliyat tahlilini ko'rish"
                      >
                        📈 Faoliyat tahlili
                      </button>
                      {/* Statistika jadvalidagi nom bilan qo'lda bog'lash — Sheet'da
                          boshqacha yozilgan ustozlar statistikasi ko'rinishi uchun */}
                      {(u.approved || u.isAdmin) && (
                        <button
                          style={{
                            background: "none", border: "none", padding: 0,
                            color: u.statsName ? "var(--success)" : "var(--primary)", cursor: "pointer",
                            fontSize: 13, textDecoration: "underline",
                          }}
                          disabled={working}
                          onClick={() => openStats(u)}
                          title={u.statsName
                            ? `Statistika "${u.statsName}" nomiga biriktirilgan — o'zgartirish uchun bosing`
                            : "Statistika ko'rinmayotgan bo'lsa — jadvaldagi nomga qo'lda biriktiring"}
                        >
                          📊 {u.statsName ? `Statistika: ${u.statsName}` : "Statistikaga biriktirish"}
                        </button>
                      )}
                    </span>
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

                {/* Ofis admin roli — har qanday admin boshqaradi (roadmap + yo'riqnoma) */}
                <span>
                  <button
                    className={`grant-btn ${u.officeAdmin ? "on" : ""}`}
                    disabled={working}
                    onClick={() => patch(u, { officeAdmin: !u.officeAdmin })}
                    title={u.officeAdmin ? "Bosilsa: ofis admin huquqi olib tashlanadi" : "Bosilsa: ofis admin (Yo'l xaritasi + Yo'riqnoma) beriladi"}
                  >
                    {working ? "…" : u.officeAdmin ? "✓ Ofis admin" : "+ Ofis admin"}
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

      {/* ---- Ro'yxatga biriktirish oynasi ---- */}
      {bindUser && (() => {
        // Allaqachon boshqa approved account egallagan roster ismlari — belgilab qo'yamiz
        const takenKeys = new Set(
          rows.filter((x) => x.approved && x.id !== bindUser.id).map((x) => normName(x.name)),
        );
        // O'xshashlik: account ismi va (bo'lsa) ustozlik so'rovida yozgan ismi bilan
        const simFor = (r: RosterItem) =>
          Math.max(nameSim(bindUser.name, r.name), bindUser.teacherRequestName ? nameSim(bindUser.teacherRequestName, r.name) : 0);
        const needle = bindQ.trim().toLowerCase();
        const list = (roster ?? [])
          .map((r) => ({ r, sim: simFor(r), taken: takenKeys.has(normName(r.name)) }))
          .filter(({ r }) => !needle || r.name.toLowerCase().includes(needle))
          .sort((a, b) => b.sim - a.sim)
          .slice(0, 30);
        return (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
            onClick={() => setBindUser(null)}
          >
            <div
              className="card"
              style={{ maxWidth: 520, width: "100%", maxHeight: "80vh", overflow: "auto", margin: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="between" style={{ alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: 0 }}>🔗 Ro'yxatga biriktirish</h3>
                  <p className="muted text-sm" style={{ margin: "4px 0 0" }}>
                    <b>{bindUser.name}</b> ({bindUser.email})
                    {bindUser.teacherRequestName && bindUser.teacherRequestName !== bindUser.name && (
                      <> · so'rovda: <b>{bindUser.teacherRequestName}</b></>
                    )}
                  </p>
                </div>
                <button className="icon-btn" onClick={() => setBindUser(null)} title="Yopish">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <p className="muted text-sm" style={{ margin: "8px 0" }}>
                Eng o'xshash ismlar tepada. Tanlangach account ismi ro'yxatdagi imlo bilan
                almashadi — ustoz huquqi va statistika avtomatik bog'lanadi.
              </p>
              <input
                className="filter-search"
                style={{ width: "100%" }}
                placeholder="🔍 Ro'yxatdan qidirish…"
                value={bindQ}
                onChange={(e) => setBindQ(e.target.value)}
                autoFocus
              />
              {roster === null ? (
                <p className="muted">Yuklanmoqda…</p>
              ) : list.length === 0 ? (
                <p className="muted">Topilmadi.</p>
              ) : (
                <div style={{ marginTop: 8 }}>
                  {list.map(({ r, sim, taken }) => (
                    <button
                      key={r.id}
                      disabled={taken || busy === bindUser.id}
                      onClick={() => bindToRoster(bindUser, r)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        width: "100%", textAlign: "left", padding: "9px 12px", marginBottom: 4,
                        borderRadius: 10, border: "1px solid var(--surface-2, rgba(0,0,0,0.08))",
                        background: sim >= 0.75 && !taken ? "var(--primary-soft, rgba(70,130,240,0.10))" : "transparent",
                        cursor: taken ? "not-allowed" : "pointer", opacity: taken ? 0.5 : 1, font: "inherit",
                        color: "inherit",
                      }}
                      title={taken ? "Bu ism allaqachon boshqa accountga biriktirilgan" : `Biriktirish: ${r.name}`}
                    >
                      <span>
                        {r.name}
                        {r.branch && <span className="muted text-sm"> · {r.branch}</span>}
                      </span>
                      <span className="muted text-sm" style={{ whiteSpace: "nowrap" }}>
                        {taken ? "band" : sim >= 0.99 ? "aynan mos" : sim >= 0.75 ? `~${Math.round(sim * 100)}% o'xshash` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Statistika (Google Sheet) nomini qo'lda biriktirish.
          Farqi: account ismiga TEGMAYDI — faqat statistika/tahlil shu nom bo'yicha olinadi. */}
      {statsUser && (() => {
        const needle = statQ.trim().toLowerCase();
        const list = (statNames ?? [])
          .map((n) => ({ n, sim: nameSim(statsUser.name, n) }))
          .filter(({ n }) => !needle || n.toLowerCase().includes(needle))
          .sort((a, b) => b.sim - a.sim)
          .slice(0, 30);
        return (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
            onClick={() => setStatsUser(null)}
          >
            <div
              className="card"
              style={{ maxWidth: 520, width: "100%", maxHeight: "80vh", overflow: "auto", margin: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="between" style={{ alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ margin: 0 }}>📊 Statistikaga biriktirish</h3>
                  <p className="muted text-sm" style={{ margin: "4px 0 0" }}>
                    <b>{statsUser.name}</b> ({statsUser.email})
                  </p>
                </div>
                <button className="icon-btn" onClick={() => setStatsUser(null)} title="Yopish">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <p className="muted text-sm" style={{ margin: "8px 0" }}>
                Statistika jadvalidagi <b>aniq nomni</b> tanlang. Account ismi o'zgarmaydi —
                faqat statistika va tahlil shu nom bo'yicha olinadi.
              </p>

              {statsUser.statsName && (
                <div className="between" style={{ gap: 8, padding: "8px 10px", borderRadius: 10, background: "var(--success-soft, rgba(40,160,90,0.10))", marginBottom: 8 }}>
                  <span className="text-sm">Hozir: <b>{statsUser.statsName}</b></span>
                  <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }}
                    disabled={busy === statsUser.id}
                    onClick={() => setStatsName(statsUser, null)}>
                    Bekor qilish
                  </button>
                </div>
              )}

              <input
                value={statQ}
                onChange={(e) => setStatQ(e.target.value)}
                placeholder="Jadvaldagi nomni qidirish…"
                style={{ width: "100%", marginBottom: 8 }}
              />

              {statNames === null ? (
                <p className="muted text-sm">Yuklanmoqda…</p>
              ) : statNames.length === 0 ? (
                <p className="muted text-sm">Statistika jadvali yuklanmadi. Keyinroq urinib ko'ring.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {list.map(({ n, sim }) => (
                    <button
                      key={n}
                      disabled={busy === statsUser.id}
                      onClick={() => setStatsName(statsUser, n)}
                      className="between"
                      style={{
                        textAlign: "left", padding: "8px 10px", borderRadius: 10,
                        border: "1px solid var(--surface-2, rgba(0,0,0,0.08))",
                        background: sim >= 0.75 ? "var(--primary-soft, rgba(70,130,240,0.10))" : "transparent",
                        cursor: "pointer", font: "inherit", color: "inherit",
                      }}
                      title={`Statistikaga biriktirish: ${n}`}
                    >
                      <span>{n}</span>
                      <span className="muted text-sm" style={{ whiteSpace: "nowrap" }}>
                        {sim >= 0.99 ? "aynan mos" : sim >= 0.75 ? `~${Math.round(sim * 100)}% o'xshash` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </Shell>
  );
}
