import { Component, type ErrorInfo, type ReactNode } from "react";

// Render paytida kutilmagan xato bo'lsa — butun sahifa oq/qotgan holatga tushmasin.
// Buning o'rniga foydalanuvchiga tushunarli xabar + "Qayta yuklash" tugmasi ko'rsatamiz.
// (React'da render xatolarini faqat class-komponent ErrorBoundary ushlay oladi.)
interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Diagnostika uchun konsolga yozamiz (tashqi xizmatga yubormaymiz)
    console.error("UI xatosi (ErrorBoundary ushladi):", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          padding: 24, background: "var(--bg, #faf7f2)", color: "var(--ink, #2b2b2b)",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🙁</div>
          <h1 style={{ fontSize: 24, marginBottom: 8 }}>Nimadir xato ketdi</h1>
          <p style={{ opacity: 0.75, marginBottom: 20, lineHeight: 1.5 }}>
            Sahifani ko'rsatishda kutilmagan xatolik yuz berdi. Sahifani qayta yuklab ko'ring —
            odatda bu muammoni hal qiladi. Ma'lumotlaringiz saqlanib qoladi.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "12px 28px", fontSize: 16, fontWeight: 700, cursor: "pointer",
              borderRadius: 14, border: "none", background: "var(--primary, #e8772e)", color: "#fff",
            }}
          >
            🔄 Qayta yuklash
          </button>
        </div>
      </div>
    );
  }
}
