import { useEffect, useRef, useState } from "react";
import { api } from "../api";

export interface LessonHit {
  id: string;
  title: string;
  subject: "ROBOTEXNIKA" | "DASTURLASH";
  ageGroup: "MIDDLE" | "SENIOR";
  year: number;
  section: string | null;
  order: number;
  hasQuiz: boolean;
}
export interface GuideHit {
  id: string;
  title: string;
  snippet: string;
}

const SUBJECT_LABEL: Record<string, string> = { ROBOTEXNIKA: "Robotexnika", DASTURLASH: "Dasturlash" };
const AGE_LABEL: Record<string, string> = { MIDDLE: "Middle", SENIOR: "Senior" };
const SECTION_LABEL: Record<string, string> = { DESIGN: "Design", PROGRAMMING: "Programming", ROBOTICS: "Robotics" };

function lessonMeta(l: LessonHit): string {
  const parts = [SUBJECT_LABEL[l.subject], AGE_LABEL[l.ageGroup], `${l.year}-yil`];
  if (l.section) parts.push(SECTION_LABEL[l.section] ?? l.section);
  return parts.join(" · ");
}

interface Props {
  scope: "lessons" | "guide";
  onPick: (item: LessonHit | GuideHit) => void;
  placeholder?: string;
}

export default function SearchBar({ scope, onPick, placeholder }: Props) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<(LessonHit | GuideHit)[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Debounce — yozishdan 250ms keyin so'rov, faqat shu bo'limga tegishli natijalar
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      api<{ lessons: LessonHit[]; guide: GuideHit[] }>(`/search?q=${encodeURIComponent(term)}`)
        .then((r) => setItems(scope === "lessons" ? r.lessons : r.guide))
        .catch(() => setItems([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, scope]);

  // Tashqariga bosilganda yopish
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(item: LessonHit | GuideHit) {
    onPick(item);
    setOpen(false);
    setQ("");
  }

  const showPanel = open && q.trim().length >= 2;
  const hover = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = "var(--surface-high)"),
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => (e.currentTarget.style.background = "none"),
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", width: 320, maxWidth: "100%" }}>
      <div style={{ position: "relative" }}>
        <span className="material-symbols-outlined" style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          fontSize: 20, color: "var(--muted)", pointerEvents: "none",
        }}>search</span>
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Qidirish…"}
          style={{
            width: "100%", padding: "9px 32px 9px 36px", borderRadius: 10,
            border: "2px solid var(--border)", background: "var(--surface)",
            fontSize: 14, color: "var(--ink)", marginBottom: 0,
          }}
        />
        {q && (
          <button onClick={() => { setQ(""); setOpen(false); }} title="Tozalash"
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", color: "var(--muted)", display: "flex" }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
          </button>
        )}
      </div>

      {showPanel && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50,
          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
          boxShadow: "0 8px 30px rgba(0,0,0,0.18)", maxHeight: 420, overflowY: "auto", padding: 6,
        }}>
          {loading ? (
            <div className="muted" style={{ padding: 12, fontSize: 13 }}>Qidirilmoqda…</div>
          ) : items.length === 0 ? (
            <div className="muted" style={{ padding: 12, fontSize: 13 }}>Hech narsa topilmadi</div>
          ) : scope === "lessons" ? (
            (items as LessonHit[]).map((l) => (
              <button key={l.id} onClick={() => pick(l)} style={resultBtn} {...hover}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: l.hasQuiz ? "#22c55e" : "#f59e0b", flexShrink: 0, marginTop: 1 }}>
                  {l.hasQuiz ? "task_alt" : "schedule"}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.title}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{lessonMeta(l)}</span>
                </span>
              </button>
            ))
          ) : (
            (items as GuideHit[]).map((g) => (
              <button key={g.id} onClick={() => pick(g)} style={resultBtn} {...hover}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--primary)", flexShrink: 0, marginTop: 1 }}>description</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.title}</span>
                  {g.snippet && <span className="muted" style={{ fontSize: 12, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{g.snippet}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const resultBtn: React.CSSProperties = {
  display: "flex", gap: 10, alignItems: "flex-start", width: "100%", textAlign: "left",
  padding: "8px 10px", borderRadius: 8, border: "none", background: "none", cursor: "pointer",
  color: "var(--ink)",
};
