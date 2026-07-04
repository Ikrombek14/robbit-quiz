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
    // Ism va familiya to'liq bo'lishi shart — roster (jadval) bilan moslashtirish uchun
    if (name.trim().split(/\s+/).length < 2) {
      setError("Ism va familiyani to'liq kiriting (masalan: Bobonova Gulnoza)");
      return;
    }
    setBusy(true);
    try {
      await register(name.trim().replace(/\s+/g, " "), email, password);
      // Ustoz (jadvalga mos kelsa) dashboardga; o'quvchi Protected orqali /profile ga tushadi
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
        <img src="/logo.svg" alt="Robbit" style={{ height: 30, display: "block", margin: "0 auto 14px" }} />
        <h2 style={{ marginTop: 0 }}>Ro'yxatdan o'tish</h2>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <label>Ism va familiya</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Masalan: Bobonova Gulnoza"
            autoComplete="name"
            autoFocus
            required
          />
          <p className="muted text-sm" style={{ margin: "4px 0 10px" }}>
            ⚠️ Ustoz bo'lsangiz, ism-familiyangizni <b>ustozlar jadvalidagi bilan bir xil</b> yozing —
            shunda ustoz paneli avtomatik ochiladi.
          </p>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@robbit.uz"
            autoComplete="email"
            required
          />
          <label>Parol (kamida 6 belgi)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
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
