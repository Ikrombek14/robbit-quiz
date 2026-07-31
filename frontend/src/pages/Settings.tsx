import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";
import type { TeacherCertificate } from "../types";

interface ProfileData {
  phone: string | null;
  picture: string | null;
  certificates: TeacherCertificate[];
}

function ProfileCard() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [certTitle, setCertTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const certFileRef = useRef<HTMLInputElement>(null);

  function load() {
    api<ProfileData>("/profile/me")
      .then((d) => { setData(d); setPhone(d.phone ?? ""); })
      .catch(() => {});
  }
  useEffect(load, []);

  async function savePhone() {
    setErr(""); setMsg(""); setBusy(true);
    try {
      await api("/profile/me", { method: "PATCH", body: JSON.stringify({ phone: phone.trim() || null }) });
      setMsg("✓ Saqlandi");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPicture(file: File) {
    setErr(""); setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { url } = await api<{ url: string }>("/profile/upload", { method: "POST", body: fd });
      await api("/profile/me", { method: "PATCH", body: JSON.stringify({ picture: url }) });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Yuklashda xatolik");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addCertificate(file: File) {
    if (!certTitle.trim()) {
      setErr("Avval sertifikat nomini kiriting");
      return;
    }
    setErr(""); setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { url } = await api<{ url: string }>("/profile/upload", { method: "POST", body: fd });
      await api("/profile/certificates", { method: "POST", body: JSON.stringify({ title: certTitle.trim(), fileUrl: url }) });
      setCertTitle("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Yuklashda xatolik");
    } finally {
      setBusy(false);
      if (certFileRef.current) certFileRef.current.value = "";
    }
  }

  async function removeCertificate(id: string) {
    try {
      await api(`/profile/certificates/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Xatolik");
    }
  }

  if (!data) return null;

  return (
    <div className="card" style={{ maxWidth: 460, marginTop: 12 }}>
      <h2 style={{ marginTop: 0, fontSize: 20 }}>👤 Profil</h2>
      {err && <div className="error">{err}</div>}
      {msg && <div className="import-progress">{msg}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "8px 0 16px" }}>
        {data.picture
          ? <img src={data.picture} alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
          : <div className="side-avatar" style={{ width: 64, height: 64, fontSize: 24 }}>👤</div>}
        <div>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
            Rasm yuklash
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPicture(f); }} />
        </div>
      </div>

      <label>Telefon raqami</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
        <button type="button" className="btn" disabled={busy} onClick={savePhone}>Saqlash</button>
      </div>

      <div style={{ marginTop: 18 }}>
        <label>Sertifikatlar</label>
        {data.certificates.length === 0 && <p className="muted" style={{ margin: "4px 0" }}>Hali sertifikat yuklanmagan</p>}
        {data.certificates.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border, #eee)" }}>
            <a href={c.fileUrl} target="_blank" rel="noreferrer" style={{ flex: 1 }}>{c.title}</a>
            <button type="button" className="icon-btn" title="O'chirish" onClick={() => removeCertificate(c.id)}>
              <span className="material-symbols-outlined">delete</span>
            </button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input value={certTitle} onChange={(e) => setCertTitle(e.target.value)} placeholder="Sertifikat nomi (masalan: Ingliz tili B1)" style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => certFileRef.current?.click()}>
            Fayl tanlash
          </button>
          <input ref={certFileRef} type="file" accept="image/*,.pdf" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) addCertificate(f); }} />
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const { teacher } = useAuth();
  const hasPassword = teacher?.hasPassword === true;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (next.length < 6) {
      setErr("Yangi parol kamida 6 belgi bo'lishi kerak");
      return;
    }
    if (next !== confirm) {
      setErr("Parollar mos kelmadi");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: hasPassword ? current : undefined, newPassword: next }),
      });
      setMsg("✓ Parol yangilandi. Endi shu parol bilan kira olasiz.");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1 style={{ fontSize: 28 }}>Sozlamalar</h1>

      <ProfileCard />

      <div className="card" style={{ maxWidth: 460, marginTop: 12 }}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>🔑 Parol</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {hasPassword
            ? "Parolingizni o'zgartirish uchun joriy parolni kiriting."
            : "Hozircha parolingiz yo'q (Google bilan kirgansiz). Bu yerda parol o'rnatib, keyin email + parol bilan ham kira olasiz."}
        </p>

        {err && <div className="error">{err}</div>}
        {msg && <div className="import-progress">{msg}</div>}

        <form onSubmit={submit}>
          {hasPassword && (
            <>
              <label>Joriy parol</label>
              <input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </>
          )}
          <label>Yangi parol</label>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="kamida 6 belgi"
            autoComplete="new-password"
            required
          />
          <label>Yangi parolni tasdiqlang</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          <button className="btn btn-block" type="submit" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? "Saqlanmoqda…" : hasPassword ? "Parolni o'zgartirish" : "Parol o'rnatish"}
          </button>
        </form>
      </div>
    </Shell>
  );
}
