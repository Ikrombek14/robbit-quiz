import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  // Claude (Anthropic) — PULLIK shaxsiy kalit. Faqat claudeEmails dagi akkauntlar ishlatadi.
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Claude'dan foydalana oladigan akkauntlar (vergul bilan; "*" = hamma). Qolganlar Gemini'da.
  claudeEmails: (process.env.CLAUDE_EMAILS ?? "ikrombekmurodov7@gmail.com")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  // Google Gemini (aistudio.google.com) — TEKIN reja bilan ishlaydi.
  // AI savol generatsiyasi sukut bo'yicha shu orqali ketadi.
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  // Hisobot dashboard ichki API — ERP'dan jonli tekshirilmagan uy vazifalar soni (hwGate)
  dashboardUrl: (process.env.DASHBOARD_INTERNAL_URL ?? "https://dashboard.robbitonline.uz").replace(/\/$/, ""),
  dashboardToken: process.env.DASHBOARD_INTERNAL_TOKEN ?? "",
  production: process.env.NODE_ENV === "production",
  adminEmails: (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean),
  // Robbit ERP (admin.robbit.uz) integratsiyasi — server-to-server, faqat o'qish
  erp: {
    url: process.env.ROBBIT_ERP_URL ?? "https://api.robbit.uz",
    login: process.env.ROBBIT_ERP_LOGIN ?? "",
    password: process.env.ROBBIT_ERP_PASSWORD ?? "",
  },
};
