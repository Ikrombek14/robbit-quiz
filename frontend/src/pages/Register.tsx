import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await register(name, email, password);
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
        <h2 style={{ marginTop: 0 }}>Ro'yxatdan o'tish</h2>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>Ism</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@robbit.uz"
            required
          />
          <label>Parol (kamida 6 belgi)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? "Yaratilmoqda…" : "Ro'yxatdan o'tish"}
          </button>
        </form>
        <p className="center muted" style={{ marginBottom: 0 }}>
          Akkaunt bormi? <Link to="/login">Kirish</Link>
        </p>
      </div>
    </div>
  );
}
