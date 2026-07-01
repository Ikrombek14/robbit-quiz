import { useEffect, useRef, useState } from "react";
import type { QuizListItem } from "../types";

// Yozib qidiriladigan quiz tanlagich (katta <select> o'rniga).
// Ko'p quiz orasidan darrov topish uchun — o'quv dasturda slayd biriktirishda ishlatiladi.
export default function QuizPicker({
  quizzes,
  value,
  onChange,
  placeholder,
}: {
  quizzes: QuizListItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const selected = quizzes.find((x) => x.id === value) || null;

  // Tashqariga bosilganda yopamiz
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const term = q.trim().toLowerCase();
  const filtered = (term ? quizzes.filter((x) => x.title.toLowerCase().includes(term)) : quizzes).slice(0, 50);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <input
        value={open ? q : selected ? selected.title : ""}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        placeholder={selected ? selected.title : placeholder ?? "Slayd qidirish…"}
        style={{
          width: "100%", padding: "8px 12px", borderRadius: 8,
          border: "2px solid var(--border)", background: "var(--surface)",
          fontSize: 14, color: "var(--ink)",
        }}
      />
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30,
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 260, overflowY: "auto",
          }}
        >
          <div
            onClick={() => { onChange(""); setOpen(false); }}
            style={{ padding: "8px 12px", cursor: "pointer", fontSize: 14, color: "var(--muted)" }}
          >
            — Biriktirilmagan —
          </div>
          {filtered.map((x) => (
            <div
              key={x.id}
              onClick={() => { onChange(x.id); setOpen(false); }}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: 14,
                background: x.id === value ? "var(--primary-soft)" : undefined,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {x.title} <span className="muted" style={{ fontSize: 12 }}>({x._count.slides} slayd)</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: "8px 12px", fontSize: 13, color: "var(--muted)" }}>Topilmadi</div>
          )}
        </div>
      )}
    </div>
  );
}
