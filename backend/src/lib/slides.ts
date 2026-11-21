// Slayd qatorini (DB) API ko'rinishiga o'girish — `data` bazada JSON MATN, tashqarida obyekt.
// REST (routes/quizzes.ts) va MCP shu bitta funksiyadan foydalanadi.

export interface SlideRow {
  id: string;
  order: number;
  kind: string;
  type: string | null;
  data: string;
  notes: string | null;
  timeLimit: number;
  points: number;
}

export function parseSlide(s: SlideRow) {
  let data: unknown = {};
  try {
    data = JSON.parse(s.data);
  } catch {
    data = {};
  }
  return {
    id: s.id,
    kind: s.kind,
    type: s.type,
    data,
    notes: s.notes,
    timeLimit: s.timeLimit,
    points: s.points,
  };
}
