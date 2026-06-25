import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Login() {
  const { login } = useAuth();
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

  return (
    <div className="center-screen">
      <div className="card card-narrow">
        <h2 style={{ marginTop: 0 }}>O'qituvchi kirishi</h2>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@robbit.uz"
            required
          />
          <label>Parol</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? "Kirilmoqda…" : "Kirish"}
          </button>
        </form>
        <p className="center muted" style={{ marginBottom: 0 }}>
          Akkaunt yo'qmi? <Link to="/register">Ro'yxatdan o'tish</Link>
        </p>
      </div>
    </div>
  );
}
