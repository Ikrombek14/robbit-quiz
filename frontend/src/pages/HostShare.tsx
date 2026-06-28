import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import GoogleButton from "../components/GoogleButton";

// Ulashilgan dars HOST havolasi: /h/:id
// Ustoz ochsa — kirgan bo'lsa darhol host qiladi; bo'lmasa Gmail/parol bilan kiradi.
export default function HostShare() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { teacher, loading, login, loginWithGoogle } = useAuth();

  const [title, setTitle] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Dars nomini (auth'siz) olamiz — kirish ekranida ko'rsatish uchun
  useEffect(() => {
    api<{ quiz: { title: string } }>(`/public/quizzes/${id}`)
      .then((r) => setTitle(r.quiz.title))
      .catch(() => setNotFound(true));
  }, [id]);

  // Kirgan bo'lsa — to'g'ridan-to'g'ri host sahifasiga
  useEffect(() => {
    if (!loading && teacher) navigate(`/host/${id}`, { replace: true });
  }, [loading, teacher, id, navigate]);

  async function onEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
      // teacher o'rnatilgach yuqoridagi useEffect host'ga o'tkazadi
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kirish xatosi");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle(credential: string) {
    setError("");
    try {
      await loginWithGoogle(credential);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google kirish xatosi");
    }
  }

  if (loading || teacher) return <div className="center-screen">Yuklanmoqda…</div>;

  if (notFound)
    return (
      <div className="center-screen">
        <div className="card card-narrow center">
          <h2>Dars topilmadi</h2>
          <p className="muted">Havola eskirgan yoki noto'g'ri bo'lishi mumkin.</p>
          <Link to="/">Bosh sahifa</Link>
        </div>
      </div>
    );

  return (
    <div className="center-screen">
      <div className="card card-narrow">
        <div className="center" style={{ marginBottom: 6 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: "var(--primary)" }}>co_present</span>
        </div>
        <h2 style={{ marginTop: 0, textAlign: "center" }}>Darsni host qilish</h2>
        {title && <p className="center" style={{ fontWeight: 700, fontSize: 18, marginTop: -4 }}>«{title}»</p>}
        <p className="muted center" style={{ marginTop: 0 }}>Bu darsni o'quvchilarga taqdim qilish uchun ustoz sifatida kiring.</p>

        {error && <div className="error">{error}</div>}

        <div style={{ display: "flex", justifyContent: "center", margin: "8px 0 4px" }}>
          <GoogleButton onCredential={onGoogle} />
        </div>

        <div className="or-divider">yoki</div>

        <form onSubmit={onEmailLogin}>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@robbit.uz" required />
          <label>Parol</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button className="btn btn-block" type="submit" disabled={busy}>
            {busy ? "Kirilmoqda…" : "Kirish va host qilish"}
          </button>
        </form>

        <p className="center muted" style={{ marginBottom: 0 }}>
          Akkaunt yo'qmi? <Link to={`/register`}>Ro'yxatdan o'tish</Link>
        </p>
      </div>
    </div>
  );
}
