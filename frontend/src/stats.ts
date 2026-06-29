import type { TeacherStat } from "./types";

// Statistika kataklari/jadvali uchun rang tonlari (yorug'/qorong'u rejimda ham ishlaydi)
export type Tone = "good" | "warn" | "bad" | "neutral";

export const TONE_STYLE: Record<Tone, { bg: string; fg: string; border: string }> = {
  good: { bg: "rgba(34,197,94,0.14)", fg: "#16a34a", border: "rgba(34,197,94,0.38)" },
  warn: { bg: "rgba(245,158,11,0.16)", fg: "#d97706", border: "rgba(245,158,11,0.42)" },
  bad: { bg: "rgba(239,68,68,0.15)", fg: "#dc2626", border: "rgba(239,68,68,0.42)" },
  neutral: { bg: "var(--surface-high)", fg: "var(--ink)", border: "var(--border)" },
};

// Foiz metrikalari: baland = yaxshi
export function pctTone(v: number | null): Tone {
  if (v == null) return "neutral";
  if (v >= 90) return "good";
  if (v >= 75) return "warn";
  return "bad";
}
// Kechikish (daqiqa): kam = yaxshi
export function kechikishTone(v: number | null): Tone {
  if (v == null) return "neutral";
  if (v <= 5) return "good";
  if (v <= 20) return "warn";
  return "bad";
}
// Tekshirilmagan uy vazifa soni: kam = yaxshi
export function tekshTone(v: number | null): Tone {
  if (v == null) return "neutral";
  if (v <= 0) return "good";
  if (v <= 5) return "warn";
  return "bad";
}
// Ketgan o'quvchilar soni: kam = yaxshi
export function ketganTone(v: number | null): Tone {
  if (v == null) return "neutral";
  if (v <= 1) return "good";
  if (v <= 4) return "warn";
  return "bad";
}
// Umumiy ball (0–100 atrofida)
export function ballTone(v: number | null): Tone {
  if (v == null) return "neutral";
  if (v >= 80) return "good";
  if (v >= 60) return "warn";
  return "bad";
}

export interface MetricDef {
  key: keyof TeacherStat;
  label: string;
  short: string; // jadval sarlavhasi uchun qisqa nom
  unit: string;
  tone: (v: number | null) => Tone;
}

// Bosh sahifadagi katta kataklar tartibi (foydalanuvchi so'ragan 5 ta)
export const METRICS: MetricDef[] = [
  { key: "davomat", label: "Davomat", short: "Davomat", unit: "%", tone: pctTone },
  { key: "uyBajarilishi", label: "Uy vazifa bajarish", short: "Uy bajarish", unit: "%", tone: pctTone },
  { key: "uyTekshirilmaganSoni", label: "Tekshirilmagan uy vazifa", short: "Tekshirmagan", unit: "ta", tone: tekshTone },
  { key: "kechikish", label: "Kech qolish", short: "Kech qolish", unit: "daq", tone: kechikishTone },
  { key: "ketganlar", label: "Ketganlar", short: "Ketganlar", unit: "ta", tone: ketganTone },
  { key: "guruhlar", label: "Guruhlar soni", short: "Guruh", unit: "ta", tone: () => "neutral" },
];

export function fmtNum(v: number | null): string {
  return v == null ? "—" : String(v);
}
