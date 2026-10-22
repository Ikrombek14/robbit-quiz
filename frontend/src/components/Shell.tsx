import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth, homePath } from "../auth";
import { getTheme, toggleTheme, type Theme } from "../theme";

type NavRole = { isAdmin?: boolean; approved?: boolean; canCreate?: boolean; officeAdmin?: boolean; teacherRequestPending?: boolean };

interface NavItem {
  key: string;
  label: string;
  icon: string;
  path: string;
  mobileHide?: boolean;
  show?: (t: NavRole | null) => boolean;
}

// approved (yoki admin) — ustoz sahifalari (O'quv dastur, Statistika, Sessiyalar...)
const canApproved = (t: NavRole | null) => !!(t?.isAdmin || t?.approved);
// faqat admin ko'radi
const isAdmin = (t: NavRole | null) => !!t?.isAdmin;
// "slayd qilish" ruxsati bo'lganlar (admin yoki canCreate) ko'radi
const canCreateNav = (t: NavRole | null) => !!(t?.isAdmin || t?.canCreate);
// Ustoz yoki markaz admini (officeAdmin, ma'lumot ko'ruvchi) — pending ko'rmaydi:
// Yo'l xaritasi, Statistika, Ustozlar
const canStaff = (t: NavRole | null) => !!(t?.isAdmin || t?.approved || t?.officeAdmin);
// Yo'riqnoma / Sozlamalar — barcha markaz xodimlari (pending va ofis admin ham)
const canPanel = (t: NavRole | null) => !!(t?.isAdmin || t?.approved || t?.officeAdmin || t?.teacherRequestPending);

// Tartib: kundalik ishlatiladigan bo'limlar tepada (O'quv dastur — ustozning
// asosiy sahifasi), admin/xizmat bo'limlari pastda.
const NAV: NavItem[] = [
  { key: "home", label: "Bosh sahifa", icon: "home", path: "/dashboard", mobileHide: false, show: canApproved },
  { key: "curriculum", label: "O'quv dastur", icon: "menu_book", path: "/curriculum", mobileHide: false, show: canApproved },
  { key: "workshops", label: "Workshoplar", icon: "groups", path: "/workshops", mobileHide: false, show: canPanel },
  { key: "practice", label: "Amaliyot dasturi", icon: "assignment", path: "/practice", mobileHide: false, show: canPanel },
  { key: "roadmap", label: "Yo'l xaritasi", icon: "route", path: "/roadmap", mobileHide: false, show: canStaff },
  { key: "library", label: "Kutubxonam", icon: "library_books", path: "/library", mobileHide: false, show: canCreateNav },
  { key: "stats", label: "Statistika", icon: "leaderboard", path: "/stats", mobileHide: false, show: canStaff },
  { key: "tier-application", label: "Toifa oshirish", icon: "military_tech", path: "/tier-application", mobileHide: true, show: canApproved },
  { key: "sessions", label: "Sessiyalar", icon: "play_circle", path: "/sessions", mobileHide: true, show: canApproved },
  { key: "guide", label: "Yo'riqnoma", icon: "description", path: "/guide", mobileHide: false, show: canPanel },
  { key: "teachers", label: "O'qituvchilar", icon: "group", path: "/teachers", mobileHide: true, show: canStaff },
  { key: "users", label: "Foydalanuvchilar", icon: "manage_accounts", path: "/users", mobileHide: true, show: isAdmin },
  { key: "tier-applications", label: "Toifa arizalari", icon: "assignment_turned_in", path: "/tier-applications", mobileHide: true, show: isAdmin },
  { key: "bulk", label: "Ommaviy import", icon: "cloud_download", path: "/bulk-import", mobileHide: true, show: canCreateNav },
  { key: "backup", label: "Zaxira", icon: "archive", path: "/backup", mobileHide: true, show: isAdmin },
  { key: "settings", label: "Sozlamalar", icon: "settings", path: "/settings", mobileHide: false, show: canPanel },
];

export default function Shell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { teacher, logout } = useAuth();
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const canCreate = !!(teacher?.isAdmin || teacher?.canCreate); // "slayd qilish" ruxsati

  function createQuiz() {
    // Quiz darhol YARATILMAYDI — muharrirda birinchi "Saqlash"da yaratiladi.
    // Aks holda slayd qo'shmay chiqib ketilsa, bo'sh "Yangi loyiha"lar to'planib qolardi.
    navigate("/quiz/new");
  }

  return (
    <div className="shell-wrapper">
    <div className="shell">
      <aside className="sidebar">
        <button
          className="brand-logo"
          style={{ padding: "8px 12px" }}
          onClick={() => navigate(homePath(teacher ?? {}))}
          aria-label="Bosh sahifa"
        >
          <img src="/logo.svg" alt="Robbit" style={{ height: 26, display: "block" }} />
        </button>
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
                aria-current={active ? "page" : undefined}
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
            aria-label={theme === "dark" ? "Yorug' rejimga o'tish" : "Qorong'u rejimga o'tish"}
            onClick={() => setThemeState(toggleTheme())}
          >
            <span className="material-symbols-outlined">
              {theme === "dark" ? "light_mode" : "dark_mode"}
            </span>
          </button>
        </div>
      </aside>
      <main className="shell-main">
        {teacher?.isAdmin && <SheetWarning />}
        {children}
      </main>
    </div>
    </div>
  );
}

// Adminlar uchun: statistika Sheet'ida joriy oy varag'i topilmasa/bo'sh bo'lsa ogohlantirish.
// Statistika HAR DOIM joriy oy varag'idan olinadi (backend services/stats.ts).
type SheetStatus = { ok: boolean; month: string; error: string | null };
let sheetStatusP: Promise<{ sheet: SheetStatus | null }> | null = null;

function SheetWarning() {
  const [sheet, setSheet] = useState<SheetStatus | null>(null);
  useEffect(() => {
    sheetStatusP ??= api<{ sheet: SheetStatus | null }>("/stats/sheet-status");
    sheetStatusP.then((r) => setSheet(r.sheet)).catch(() => {});
  }, []);
  if (!sheet || sheet.ok) return null;
  return (
    <div className="error" style={{ margin: "0 0 16px" }}>
      ⚠️ <b>Statistika Sheet'ini to'g'rilang:</b> {sheet.error}. Ustozlar statistikasi va uy vazifa
      nazorati hozir ishlamayapti — Sheet'da "{sheet.month}" nomli varaq bo'lishi va to'ldirilishi kerak.
    </div>
  );
}
