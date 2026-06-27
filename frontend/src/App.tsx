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
import Reports from "./pages/Reports";
import ReportDetail from "./pages/ReportDetail";
import Curriculum from "./pages/Curriculum";
import Guide from "./pages/Guide";

function Protected({ children }: { children: ReactNode }) {
  const { teacher, loading } = useAuth();
  if (loading) return <div className="container">Yuklanmoqda…</div>;
  if (!teacher) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/join" element={<Join />} />
      <Route path="/s/:id" element={<PlayShared />} />
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
      <Route path="/curriculum" element={<Protected><Curriculum /></Protected>} />
      <Route path="/guide" element={<Protected><Guide /></Protected>} />

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
