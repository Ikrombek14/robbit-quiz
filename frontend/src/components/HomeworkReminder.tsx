import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";

// Tekshirilmagan uy vazifa nazorati — ustoz saytga KIRGANDA ishlaydi. Manba: ERP (jonli,
// dashboard ichki API orqali) — 48 soatdan ko'p tekshirilmay turgan ishlar; hisob backend'da
// (/stats/hw-gate, services/hwGate.ts):
//  • 10–50 ta  — oddiy eslatma (har tab-sessiyada bir marta)
//  • 50 dan ko'p — har kungi birinchi kirish 1 ogohlantirish:
//      1-kun → ERP'ga yo'naltiriladi, 2-kun → qattiq ogohlantirish, 3-kundan → to'liq blok.
//    Son 50 va undan kamaysa — hisob 0, blok o'zi ochiladi. Platforma admini 12 soatga ocha oladi.
const REMIND_FROM = 10;
const ERP_URL = "https://admin.robbit.uz/signin";
const SHOWN_KEY = "hw_reminder_shown";

type Level = "ok" | "redirect" | "warn" | "block";
interface Gate { level: Level; count: number | null; strikes: number; limit: number; olderThanHours?: number }

// Sahifalar orasida yurganda qayta so'ramaymiz (Protected har marshrutda qayta chiziladi).
// force — "Qayta tekshirish": server ERP'dan yangi sonni oladi (fresh).
let cached: { teacherId: string; p: Promise<Gate> } | null = null;
function loadGate(teacherId: string, force = false): Promise<Gate> {
  if (force || cached?.teacherId !== teacherId) {
    cached = {
      teacherId,
      p: api<Gate>("/stats/hw-gate", { method: "POST", body: JSON.stringify(force ? { fresh: true } : {}) }),
    };
  }
  return cached.p;
}

export default function HomeworkReminder() {
  const { teacher, logout } = useAuth();
  const [gate, setGate] = useState<Gate | null>(null);
  const [dismissed, setDismissed] = useState(() => !!sessionStorage.getItem(SHOWN_KEY));
  const [checking, setChecking] = useState(false);
  // Jonli dars ekranida (Host) yo'naltirish/ogohlantirish chiqmaydi — dars o'rtasida sahifa
  // yangilansa proyektordagi ekran ERP'ga o'tib ketmasin. Blok esa bu yerda ham ishlaydi.
  const onHost = useLocation().pathname.startsWith("/host/");

  useEffect(() => {
    if (!teacher) return;
    let alive = true;
    loadGate(teacher.id)
      .then((g) => alive && setGate(g))
      .catch(() => {});
    return () => { alive = false; };
  }, [teacher?.id]);

  // 1-ogohlantirish: ERP'ga yo'naltirish (tab-sessiyada bir marta, 4 soniyadan keyin)
  useEffect(() => {
    if (gate?.level !== "redirect" || dismissed || onHost) return;
    const t = setTimeout(() => goErp(), 4000);
    return () => clearTimeout(t);
  }, [gate?.level, dismissed, onHost]);

  if (!teacher || !gate) return null;

  function dismiss() {
    sessionStorage.setItem(SHOWN_KEY, "1");
    setDismissed(true);
  }
  function goErp() {
    sessionStorage.setItem(SHOWN_KEY, "1");
    window.location.href = ERP_URL;
  }
  async function recheck() {
    if (!teacher) return;
    setChecking(true);
    try { setGate(await loadGate(teacher.id, true)); } catch { /* eski holat qoladi */ }
    setChecking(false);
  }

  const count = gate.count ?? 0;
  const hours = gate.olderThanHours ?? 48;
  const countEl = <b style={{ color: "var(--danger, #e05661)", fontSize: 20 }}>{count} ta</b>;

  // 3-ogohlantirishdan keyin — to'liq blok (yopib bo'lmaydi)
  if (gate.level === "block") {
    return (
      <div className="modal-overlay" style={{ zIndex: 1000, background: "rgba(27,29,39,0.85)" }}>
        <div className="card" style={{ maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 50 }}>🔒</div>
          <h2 style={{ margin: "8px 0 4px" }}>Platforma vaqtincha yopildi</h2>
          <p style={{ fontSize: 16, lineHeight: 1.55, margin: "8px 0 0" }}>
            Sizda {hours} soatdan ko'p tekshirilmay turgan {countEl} uy vazifa bor. Platformadan
            foydalanish uchun ularni <b>{gate.limit} tadan kamaytiring</b>.
          </p>
          <p className="muted text-sm" style={{ marginTop: 8 }}>
            Son ERP'dan jonli olinadi: tekshirib bo'lgach «Qayta tekshirish»ni bosing — platforma
            darhol ochiladi. Shoshilinch bo'lsa, platforma admini vaqtincha ochib berishi mumkin.
          </p>
          <button className="btn btn-block" style={{ marginTop: 14 }} onClick={goErp}>
            ERP'ga o'tib tekshirish
          </button>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} disabled={checking} onClick={recheck}>
              {checking ? "Tekshirilmoqda…" : "🔄 Qayta tekshirish"}
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={logout}>Chiqish</button>
          </div>
        </div>
      </div>
    );
  }

  if (dismissed || onHost) return null;

  // 1-ogohlantirish — ERP'ga yo'naltiriladi
  if (gate.level === "redirect") {
    return (
      <div className="modal-overlay">
        <div className="card" style={{ maxWidth: 440, textAlign: "center" }}>
          <div style={{ fontSize: 46 }}>📝</div>
          <h2 style={{ margin: "8px 0 4px" }}>Avval uy vazifalarni tekshiring</h2>
          <p style={{ fontSize: 16, lineHeight: 1.55, margin: "8px 0 0" }}>
            Sizda {hours} soatdan ko'p tekshirilmay turgan {countEl} uy vazifa bor ({gate.limit} tadan
            ko'p). Hozir ERP tizimiga yo'naltirilasiz…
          </p>
          <button className="btn btn-block" style={{ marginTop: 14 }} onClick={goErp}>ERP'ga o'tish</button>
        </div>
      </div>
    );
  }

  // 2-ogohlantirish — qattiq ogohlantirish, keyingi safar blok
  if (gate.level === "warn") {
    return (
      <div className="modal-overlay">
        <div className="card" style={{ maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 46 }}>⚠️</div>
          <h2 style={{ margin: "8px 0 4px", color: "var(--danger, #e05661)" }}>Oxirgi ogohlantirish!</h2>
          <p style={{ fontSize: 16, lineHeight: 1.55, margin: "8px 0 0" }}>
            Sizda {hours} soatdan ko'p tekshirilmay turgan {countEl} uy vazifa bor. Ertaga ham
            {" "}{gate.limit} tadan ko'p bo'lsa, <b>platforma siz uchun yopiladi</b>.
          </p>
          <button className="btn btn-block" style={{ marginTop: 14 }} onClick={goErp}>ERP'ga o'tib tekshirish</button>
          <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={dismiss}>Tushunarli</button>
        </div>
      </div>
    );
  }

  // Oddiy eslatma (10 tadan ko'p)
  if (count < REMIND_FROM) return null;
  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div className="card" style={{ maxWidth: 440, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 46 }}>📝</div>
        <h2 style={{ margin: "8px 0 4px" }}>Tekshirilmagan uy vazifalar!</h2>
        <p style={{ fontSize: 16, lineHeight: 1.55, margin: "8px 0 0" }}>
          Sizda {hours} soatdan beri tekshirilmay turgan {countEl} uy vazifa bor. Iltimos, bugundan
          qoldirmasdan tekshirib qo'ying.
        </p>
        <p className="muted text-sm" style={{ marginTop: 8 }}>
          {gate.limit} tadan oshsa platformadan foydalanish cheklanadi.
        </p>
        <button className="btn btn-block" style={{ marginTop: 14 }} onClick={dismiss}>
          Tushunarli, tekshiraman
        </button>
      </div>
    </div>
  );
}
