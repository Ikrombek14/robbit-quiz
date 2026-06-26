import { useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import type { Quiz } from "../types";
import { getTheme, toggleTheme, type Theme } from "../theme";

const NAV = [
  { key: "home", label: "Bosh sahifa", icon: "home", path: "/dashboard", mobileHide: false },
  { key: "library", label: "Kutubxonam", icon: "library_books", path: "/library", mobileHide: false },
  { key: "sessions", label: "Sessiyalar", icon: "play_circle", path: "/sessions", mobileHide: true },
  { key: "students", label: "O'quvchilar", icon: "group", path: "/students", soon: true, mobileHide: true },
  { key: "curriculum", label: "O'quv dastur", icon: "menu_book", path: "/curriculum", mobileHide: false },
];

export default function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { teacher, logout } = useAuth();
  const [theme, setThemeState] = useState<Theme>(getTheme());

  async function createQuiz() {
    const r = await api<{ quiz: Quiz }>("/quizzes", {
      method: "POST",
      body: JSON.stringify({ title: "Yangi loyiha", slides: [] }),
    });
    navigate(`/quiz/${r.quiz.id}`);
  }

  return (
    <div className="shell-wrapper">
    <div className="shell">
      <aside className="sidebar">
        <div
          className="brand-logo"
          style={{ padding: "8px 12px", cursor: "pointer" }}
          onClick={() => navigate("/dashboard")}
        >
          Robbit
        </div>
        <button className="side-create" onClick={createQuiz}>
          <span className="material-symbols-outlined">add</span>
          Yaratish
        </button>
        <nav className="side-nav">
          {NAV.map((n) => {
            const active = location.pathname === n.path || location.pathname.startsWith(n.path + "/");
            return (
              <button
                key={n.key}
                className={`side-link ${active ? "active" : ""} ${n.mobileHide ? "side-link-hide-mobile" : ""}`}
                disabled={n.soon}
                onClick={() => !n.soon && navigate(n.path)}
                title={n.soon ? "Tez orada" : n.label}
              >
                <span className="material-symbols-outlined">{n.icon}</span>
                <span>{n.label}</span>
                {n.soon && <span className="soon-badge">tez orada</span>}
              </button>
            );
          })}
        </nav>
        <div className="side-profile">
          <div className="side-avatar">{(teacher?.name?.[0] ?? "U").toUpperCase()}</div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div className="side-name">{teacher?.name ?? "Ustoz"}</div>
            <button
              className="side-logout"
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              Chiqish
            </button>
          </div>
          <button
            className="icon-btn"
            title={theme === "dark" ? "Yorug' rejim" : "Qorong'u rejim"}
            onClick={() => setThemeState(toggleTheme())}
          >
            <span className="material-symbols-outlined">
              {theme === "dark" ? "light_mode" : "dark_mode"}
            </span>
          </button>
        </div>
      </aside>
      <main className="shell-main">{children}</main>
    </div>
    </div>
  );
}
