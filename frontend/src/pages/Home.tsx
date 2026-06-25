import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function Home() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");

  return (
    <div className="center-screen">
      <h1 style={{ fontSize: 48, margin: 0, color: "var(--ink)" }}>Robbit</h1>
      <p className="muted" style={{ marginBottom: 28, fontSize: 18 }}>
        Qiziqarli bilimlar dunyosiga xush kelibsiz! 🚀
      </p>

      <div className="card card-narrow center">
        <h3 style={{ marginTop: 0 }}>Darsga qo'shilish</h3>
        <label>Dars kodi (6 raqam)</label>
        <input
          className="pin-input"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="------"
          inputMode="numeric"
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
    </div>
  );
}
