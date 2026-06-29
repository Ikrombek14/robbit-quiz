import { useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import type { Quiz } from "../types";
import { getTheme, toggleTheme, type Theme } from "../theme";

interface NavItem {
  key: string;
  label: string;
  icon: string;
  path: string;
  mobileHide?: boolean;
  show?: (t: { isAdmin?: boolean; approved?: boolean; canCreate?: boolean } | null) => boolean;
}

// approved (yoki admin) bo'lsagina O'quv dastur / Yo'riqnoma ko'rinadi
const canApproved = (t: { isAdmin?: boolean; approved?: boolean } | null) => !!(t?.isAdmin || t?.approved);
// faqat admin ko'radi
const isAdmin = (t: { isAdmin?: boolean } | null) => !!t?.isAdmin;
// "slayd qilish" ruxsati bo'lganlar (admin yoki canCreate) ko'radi
const canCreateNav = (t: { isAdmin?: boolean; canCreate?: boolean } | null) => !!(t?.isAdmin || t?.canCreate);

const NAV: NavItem[] = [
  { key: "home", label: "Bosh sahifa", icon: "home", path: "/dashboard", mobileHide: false },
  { key: "library", label: "Kutubxonam", icon: "library_books", path: "/library", mobileHide: false },
  { key: "sessions", label: "Sessiyalar", icon: "play_circle", path: "/sessions", mobileHide: true },
  { key: "teachers", label: "O'qituvchilar", icon: "group", path: "/teachers", mobileHide: true },
  { key: "users", label: "Foydalanuvchilar", icon: "manage_accounts", path: "/users", mobileHide: true, show: isAdmin },
  { key: "bulk", label: "Ommaviy import", icon: "cloud_download", path: "/bulk-import", mobileHide: true, show: canCreateNav },
  { key: "curriculum", label: "O'quv dastur", icon: "menu_book", path: "/curriculum", mobileHide: false, show: canApproved },
  { key: "guide", label: "Yo'riqnoma", icon: "description", path: "/guide", mobileHide: false, show: canApproved },
  { key: "settings", label: "Sozlamalar", icon: "settings", path: "/settings", mobileHide: false },
];

export default function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { teacher, logout } = useAuth();
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const canCreate = !!(teacher?.isAdmin || teacher?.canCreate); // "slayd qilish" ruxsati

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
        {canCreate && (
          <button className="side-create" onClick={createQuiz}>
            <span className="material-symbols-outlined">add</span>
            Yaratish
          </button>
        )}
        <nav className="side-nav">
          {NAV.filter((n) => !n.show || n.show(teacher)).map((n) => {
            const active = location.pathname === n.path || location.pathname.startsWith(n.path + "/");
            return (
              <button
                key={n.key}
                className={`side-link ${active ? "active" : ""} ${n.mobileHide ? "side-link-hide-mobile" : ""}`}
                onClick={() => navigate(n.path)}
                title={n.label}
              >
                <span className="material-symbols-outlined">{n.icon}</span>
                <span>{n.label}</span>
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
