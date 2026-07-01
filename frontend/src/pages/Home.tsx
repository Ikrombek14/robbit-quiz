import { useNavigate } from "react-router-dom";
import { useState } from "react";

// Bosh sahifa — ham o'quvchi darsga qo'shiladigan joy, ham SEO uchun
// (Google'da chiqishi uchun) mazmunli, indekslanadigan matn bo'lgan landing.
const FEATURES = [
  {
    icon: "bolt",
    title: "Jonli, real vaqtli darslar",
    text: "O'qituvchi darsni boshlaydi, o'quvchilar 6 xonali kod bilan qo'shiladi va savollarga real vaqtda javob beradi.",
  },
  {
    icon: "auto_awesome",
    title: "AI bilan savol yaratish",
    text: "PDF darslikni yuklang — sun'iy intellekt avtomatik savollar va testlar tayyorlab beradi.",
  },
  {
    icon: "leaderboard",
    title: "Reyting va tahlil",
    text: "Har bir savoldan keyin reyting, natijalar va batafsil statistika — kim qanday o'zlashtirganini ko'ring.",
  },
  {
    icon: "school",
    title: "Robotexnika va dasturlash",
    text: "Yosh toifasi va yo'nalish bo'yicha tayyor o'quv dasturlar: Design, Programming, Robotics.",
  },
];

export default function Home() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");

  return (
    <div className="center-screen">
      <header style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 48, margin: 0, color: "var(--ink)" }}>Robbit 🚀</h1>
        <p className="muted" style={{ marginBottom: 28, fontSize: 18 }}>
          Interaktiv ta'lim va jonli quiz platformasi
        </p>
      </header>

      <div className="card card-narrow center">
        <h2 style={{ marginTop: 0 }}>Darsga qo'shilish</h2>
        <label>Dars kodi (6 raqam)</label>
        <input
          className="pin-input"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="------"
          inputMode="numeric"
          aria-label="Dars kodi"
        />
        <button
          className="btn btn-pink btn-lg btn-block"
          disabled={pin.length !== 6}
          onClick={() => navigate(`/join?pin=${pin}`)}
        >
          Darsga qo'shilish →
        </button>
        <div className="spacer" />
        <button className="btn btn-ghost btn-block" onClick={() => navigate("/admin")}>
          O'qituvchi / Admin kirishi
        </button>
      </div>

      {/* SEO va tanishtiruv uchun mazmunli bo'lim */}
      <section style={{ maxWidth: 900, marginTop: 48, padding: "0 16px", textAlign: "center" }}>
        <h2 style={{ fontSize: 28, marginBottom: 10 }}>Robbit Akademiyasi nima?</h2>
        <p className="muted" style={{ fontSize: 16, lineHeight: 1.7, maxWidth: 680, margin: "0 auto 32px" }}>
          Robbit — o'qituvchilar dars slaydlari va testlar yaratadigan, o'quvchilar esa 6 xonali kod
          orqali real vaqtda darsga qo'shiladigan interaktiv ta'lim platformasi. Robotexnika va
          dasturlash yo'nalishlari bo'yicha tayyor o'quv dasturlar, jonli reyting va batafsil tahlil
          bilan darslarni qiziqarli va samarali qiladi.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            textAlign: "left",
          }}
        >
          {FEATURES.map((f) => (
            <div key={f.title} className="card" style={{ margin: 0 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: "var(--primary)" }}>
                {f.icon}
              </span>
              <h3 style={{ margin: "8px 0 6px", fontSize: 18 }}>{f.title}</h3>
              <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
                {f.text}
              </p>
            </div>
          ))}
        </div>

        <p className="muted" style={{ fontSize: 13, marginTop: 40 }}>
          © {new Date().getFullYear()} Robbit Akademiyasi · robbitquiz.uz
        </p>
      </section>
    </div>
  );
}
