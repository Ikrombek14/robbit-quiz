import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import Shell from "../components/Shell";

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
