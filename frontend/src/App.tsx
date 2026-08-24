import { Routes, Route, Link, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth, homePath } from "./auth";
import Home from "./pages/Home";
import Join from "./pages/Join";
import AdminLogin from "./pages/AdminLogin";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Library from "./pages/Library";
import ActivityDetail from "./pages/ActivityDetail";
import QuizEditor from "./pages/QuizEditor";
import Host from "./pages/Host";
import PlayShared from "./pages/PlayShared";
import HostShare from "./pages/HostShare";
import Reports from "./pages/Reports";
import ReportDetail from "./pages/ReportDetail";
import Curriculum from "./pages/Curriculum";
import Workshops from "./pages/Workshops";
import Practice from "./pages/Practice";
import Roadmap from "./pages/Roadmap";
import Guide from "./pages/Guide";
import Teachers from "./pages/Teachers";
import Users from "./pages/Users";
import Stats from "./pages/Stats";
import StatsAnalysis from "./pages/StatsAnalysis";
import Settings from "./pages/Settings";
import BulkImport from "./pages/BulkImport";
import StudentProfile from "./pages/StudentProfile";
import Backup from "./pages/Backup";
import TierApplication from "./pages/TierApplication";
import TierApplicationsAdmin from "./pages/TierApplicationsAdmin";
import Shell from "./components/Shell";

// Kirish darvozalari:
//  student — o'quvchi sahifasi (hamma uchun ochiq, kirsa bo'ldi)
//  panel   — barcha markaz xodimlari (ustoz, admin, ofis admin, so'rov yuborgan): Yo'riqnoma, Sozlamalar
//  staff   — ustoz yoki ofis admin (pending EMAS): Yo'l xaritasi
//  create  — "slayd qilish" ruxsati; admin — faqat admin
//  (default) — ustoz sahifalari: faqat ustoz/admin; ofis admin/pending o'z bosh sahifasiga yo'naltiriladi
function Protected({ children, admin, create, student, staff, panel }: {
  children: ReactNode; admin?: boolean; create?: boolean; student?: boolean; staff?: boolean; panel?: boolean;
}) {
  const { teacher, loading } = useAuth();
  if (loading) return <div className="container">Yuklanmoqda…</div>;
  if (!teacher) return <Navigate to="/admin" replace />;
  if (student) return <>{children}</>;

  const isTeacher = !!(teacher.isAdmin || teacher.approved);
  const hasPanel = isTeacher || !!teacher.officeAdmin || !!teacher.teacherRequestPending;

  // Markaz xodimi emas (tasodifiy account) — o'quvchi shaxsiy sahifasiga
  if (!hasPanel) return <Navigate to="/profile" replace />;

  // Yo'riqnoma, Sozlamalar — barcha panel foydalanuvchilariga
  if (panel) return <>{children}</>;

  // Yo'l xaritasi — ustoz yoki ofis admin (pending emas → o'z bosh sahifasiga)
  if (staff) {
    if (isTeacher || teacher.officeAdmin) return <>{children}</>;
    return <Navigate to={homePath(teacher)} replace />;
  }

  // "slayd qilish" ruxsati talab qilinsa va user'da bo'lmasa — ruxsat yo'q
  if (create && !(teacher.isAdmin || teacher.canCreate)) {
    return (
      <Shell>
        <div className="card center" style={{ marginTop: 40 }}>
          <div style={{ fontSize: 44 }}>🔒</div>
          <h2 style={{ marginTop: 8 }}>Slayd yaratish ruxsati yo'q</h2>
          <p className="muted">Bu bo'lim faqat slayd qilish ruxsati berilgan ustozlar uchun. Admin bilan bog'laning.</p>
        </div>
      </Shell>
    );
  }
  // admin talab qilinsa va user admin bo'lmasa — ruxsat yo'q
  if (admin && !teacher.isAdmin) {
    return (
      <Shell>
        <div className="card center" style={{ marginTop: 40 }}>
          <div style={{ fontSize: 44 }}>🔒</div>
          <h2 style={{ marginTop: 8 }}>Ruxsat yo'q</h2>
          <p className="muted">Bu bo'lim faqat administratorlar uchun.</p>
        </div>
      </Shell>
    );
  }
  // Qolgan ustoz sahifalari — faqat ustoz/admin. Ofis admin / pending o'z bosh sahifasiga.
  if (!isTeacher) return <Navigate to={homePath(teacher)} replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/join" element={<Join />} />
      <Route path="/s/:id" element={<PlayShared />} />
      <Route path="/h/:id" element={<HostShare />} />
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/login" element={<AdminLogin />} />
      <Route path="/register" element={<Register />} />

      <Route path="/profile" element={<Protected student><StudentProfile /></Protected>} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/library" element={<Protected><Library /></Protected>} />
      <Route path="/activity/:id" element={<Protected panel><ActivityDetail /></Protected>} />
      <Route path="/quiz/:id" element={<Protected create><QuizEditor /></Protected>} />
      <Route path="/bulk-import" element={<Protected create><BulkImport /></Protected>} />
      <Route path="/host/:quizId" element={<Protected panel><Host /></Protected>} />
      <Route path="/sessions" element={<Protected><Reports /></Protected>} />
      <Route path="/sessions/:id" element={<Protected><ReportDetail /></Protected>} />
      <Route path="/curriculum" element={<Protected><Curriculum /></Protected>} />
      <Route path="/workshops" element={<Protected panel><Workshops /></Protected>} />
      <Route path="/practice" element={<Protected panel><Practice /></Protected>} />
      <Route path="/roadmap" element={<Protected staff><Roadmap /></Protected>} />
      <Route path="/guide" element={<Protected panel><Guide /></Protected>} />
      <Route path="/teachers" element={<Protected><Teachers /></Protected>} />
      <Route path="/users" element={<Protected admin><Users /></Protected>} />
      <Route path="/backup" element={<Protected admin><Backup /></Protected>} />
      <Route path="/stats" element={<Protected><Stats /></Protected>} />
      <Route path="/stats/tahlil" element={<Protected><StatsAnalysis /></Protected>} />
      <Route path="/tier-application" element={<Protected><TierApplication /></Protected>} />
      <Route path="/tier-applications" element={<Protected admin><TierApplicationsAdmin /></Protected>} />
      <Route path="/settings" element={<Protected panel><Settings /></Protected>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="container">
      <h2>Sahifa topilmadi</h2>
      <Link to="/">Bosh sahifaga qaytish</Link>
    </div>
  );
}
