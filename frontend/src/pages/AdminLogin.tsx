import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import GoogleButton from "../components/GoogleButton";

export default function AdminLogin() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle(credential: string) {
    setError("");
    try {
      await loginWithGoogle(credential);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google kirish xatosi");
    }
  }

  return (
    <div className="center-screen">
      <div className="card card-narrow">
        <h2 style={{ marginTop: 0 }}>Admin kirish</h2>
        <p className="muted" style={{ marginTop: 0 }}>O'qituvchilar uchun</p>
        {error && <div className="error">{error}</div>}

        <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 4px" }}>
          <GoogleButton onCredential={handleGoogle} />
        </div>

        <div className="or-divider">yoki</div>

        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@robbit.uz" required />
          <label>Parol</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? "Kirilmoqda…" : "Kirish"}
          </button>
        </form>

        <details style={{ marginTop: 10 }}>
          <summary className="muted text-sm" style={{ cursor: "pointer" }}>Parolni unutdingizmi?</summary>
          <p className="muted text-sm" style={{ margin: "6px 0 0" }}>
            Google bilan kiring (yuqoridagi tugma), so'ng <b>Sozlamalar → Parol</b> bo'limidan yangi parol o'rnating.
            Agar Google'siz bo'lsa, admin bilan bog'laning — u parolingizni tiklab beradi.
          </p>
        </details>

        <p className="center muted" style={{ marginBottom: 0, marginTop: 10 }}>
          Akkaunt yo'qmi? <Link to="/register">Ro'yxatdan o'tish</Link>
        </p>
      </div>
    </div>
  );
}
