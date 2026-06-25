// Yorug'/qorong'u rejim boshqaruvi
export type Theme = "light" | "dark";

const KEY = "robbit-theme";

export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "light" || saved === "dark") return saved;
  // Saqlanmagan bo'lsa — tizim sozlamasiga ergashamiz
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
}

// Ilova ishga tushganda chaqiriladi
export function initTheme() {
  applyTheme(getTheme());
}

export function setTheme(t: Theme) {
  localStorage.setItem(KEY, t);
  applyTheme(t);
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}
