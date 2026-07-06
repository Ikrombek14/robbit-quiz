import { useEffect, useState } from "react";
import { api } from "../api";
import type { TeacherStat } from "../types";

// Tekshirilmagan uy vazifa ogohlantirishi — ustoz saytga KIRGANDA (har tab-sessiyada
// bir marta) popup chiqadi. Manba: Google Sheet statistikasi (/stats/me).
// 10 tadan kam bo'lsa bezovta qilmaymiz.
const THRESHOLD = 10;
const SESSION_KEY = "hw_reminder_shown";

export default function HomeworkReminder() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    // Shu tab-sessiyada allaqachon ko'rsatilgan bo'lsa — qayta chiqarmaymiz
    // (sahifalar orasida yurganda emas, saytga qaytadan kirganda chiqadi)
    if (sessionStorage.getItem(SESSION_KEY)) return;
    api<{ stat: TeacherStat | null }>("/stats/me")
      .then((r) => {
        const n = r.stat?.uyTekshirilmaganSoni ?? 0;
        if (n >= THRESHOLD) setCount(n);
      })
      .catch(() => {});
  }, []);

  if (count === null) return null;

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, "1");
    setCount(null);
  }

  return (
    <div className="modal-overlay" onClick={dismiss}>
      <div className="card" style={{ maxWidth: 440, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 46 }}>📝</div>
        <h2 style={{ margin: "8px 0 4px" }}>Tekshirilmagan uy vazifalar!</h2>
        <p style={{ fontSize: 16, lineHeight: 1.55, margin: "8px 0 0" }}>
          Siz <b style={{ color: "var(--danger, #e05661)", fontSize: 20 }}>{count} ta</b> uy vazifasini
          tekshirmagansiz. Iltimos, bugundan qoldirmasdan tekshirib qo'ying.
        </p>
        <p className="muted text-sm" style={{ marginTop: 8 }}>
          O'z vaqtida tekshirilgan vazifa — o'quvchi uchun eng yaxshi motivatsiya 💪
        </p>
        <button className="btn btn-block" style={{ marginTop: 14 }} onClick={dismiss}>
          Tushunarli, tekshiraman
        </button>
      </div>
    </div>
  );
}
