import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { getTheme, toggleTheme, type Theme } from "../theme";

// Bosh sahifa — birinchi ekran faqat o'quvchi uchun (PIN bilan qo'shilish, scroll'siz).
// O'qituvchi kirishi — yuqori o'ng burchakdagi kichik tugma (/admin sahifasiga).
// Pastdagi SEO bo'lim Google uchun — birinchi ekranga xalaqit bermaydi.
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
  const [theme, setThemeState] = useState<Theme>(getTheme());

  return (
    <div style={{ background: "var(--bg)" }}>
      {/* ---- Birinchi ekran: faqat o'quvchi (100vh, scroll shart emas) ---- */}
      <section className="home-hero">
        {/* Yuqori o'ng burchak — ustoz kirishi + tema (o'quvchi yo'lidan chetda) */}
        <div className="home-corner">
          <button className="btn btn-ghost" style={{ padding: "8px 14px", fontSize: 14 }}
            onClick={() => navigate("/admin")}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>school</span>
            O'qituvchi kirishi
          </button>
          <button
            className="icon-btn"
            title={theme === "dark" ? "Yorug' rejim" : "Qorong'u rejim"}
            aria-label={theme === "dark" ? "Yorug' rejimga o'tish" : "Qorong'u rejimga o'tish"}
            onClick={() => setThemeState(toggleTheme())}
          >
            <span className="material-symbols-outlined">
              {theme === "dark" ? "light_mode" : "dark_mode"}
            </span>
          </button>
        </div>

        <header style={{ textAlign: "center" }}>
          <h1 style={{ margin: 0, display: "flex", justifyContent: "center" }}>
            <img src="/logo.svg" alt="Robbit — interaktiv ta'lim va jonli quiz platformasi"
              style={{ height: 52, display: "block" }} />
          </h1>
          <p className="muted" style={{ marginBottom: 28, marginTop: 12, fontSize: 18 }}>
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
            onKeyDown={(e) => { if (e.key === "Enter" && pin.length === 6) navigate(`/join?pin=${pin}`); }}
            placeholder="------"
            inputMode="numeric"
            enterKeyHint="go"
            autoComplete="off"
            autoFocus
            aria-label="Dars kodi"
          />
          <button
            className="btn btn-pink btn-lg btn-block"
            disabled={pin.length !== 6}
            onClick={() => navigate(`/join?pin=${pin}`)}
          >
            Darsga qo'shilish →
          </button>
        </div>
      </section>

      {/* ---- SEO va tanishtiruv (birinchi ekrandan pastda — Google uchun) ---- */}
      <section style={{ maxWidth: 900, margin: "0 auto", padding: "48px 16px 24px", textAlign: "center" }}>
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
