import { Routes, Route, Link, Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth";
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
import Guide from "./pages/Guide";
import Teachers from "./pages/Teachers";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import Shell from "./components/Shell";

function Protected({ children, approved, admin }: { children: ReactNode; approved?: boolean; admin?: boolean }) {
  const { teacher, loading } = useAuth();
  if (loading) return <div className="container">Yuklanmoqda…</div>;
  if (!teacher) return <Navigate to="/admin" replace />;
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
  // approved talab qilinsa va user roster'da yo'q bo'lsa — ruxsat yo'q
  if (approved && !(teacher.isAdmin || teacher.approved)) {
    return (
      <Shell>
        <div className="card center" style={{ marginTop: 40 }}>
          <div style={{ fontSize: 44 }}>🔒</div>
          <h2 style={{ marginTop: 8 }}>Ruxsat yo'q</h2>
          <p className="muted">Bu bo'lim faqat ro'yxatdagi (tasdiqlangan) ustozlar uchun. Admin bilan bog'laning.</p>
        </div>
      </Shell>
    );
  }
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

      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/library" element={<Protected><Library /></Protected>} />
      <Route path="/activity/:id" element={<Protected><ActivityDetail /></Protected>} />
      <Route path="/quiz/:id" element={<Protected><QuizEditor /></Protected>} />
      <Route path="/host/:quizId" element={<Protected><Host /></Protected>} />
      <Route path="/sessions" element={<Protected><Reports /></Protected>} />
      <Route path="/sessions/:id" element={<Protected><ReportDetail /></Protected>} />
      <Route path="/curriculum" element={<Protected approved><Curriculum /></Protected>} />
      <Route path="/guide" element={<Protected approved><Guide /></Protected>} />
      <Route path="/teachers" element={<Protected><Teachers /></Protected>} />
      <Route path="/users" element={<Protected admin><Users /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />

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
