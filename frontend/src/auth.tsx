import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "./api";
import type { Teacher } from "./types";

interface AuthContextValue {
  teacher: Teacher | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<{ teacher: Teacher | null }>("/auth/me")
      .then((r) => setTeacher(r.teacher))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const r = await api<{ token: string; teacher: Teacher }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(r.token);
    setTeacher(r.teacher);
  }

  async function loginWithGoogle(credential: string) {
    const r = await api<{ token: string; teacher: Teacher }>("/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    });
    setToken(r.token);
    setTeacher(r.teacher);
  }

  async function register(name: string, email: string, password: string) {
    const r = await api<{ token: string; teacher: Teacher }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    setToken(r.token);
    setTeacher(r.teacher);
  }

  function logout() {
    setToken(null);
    setTeacher(null);
  }

  return (
    <AuthContext.Provider value={{ teacher, loading, login, loginWithGoogle, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth AuthProvider ichida ishlatilishi kerak");
  return ctx;
}
