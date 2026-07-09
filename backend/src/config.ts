import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  // Google Gemini (aistudio.google.com) — TEKIN reja bilan ishlaydi.
  // Kalit qo'yilgan bo'lsa AI savol generatsiyasi Gemini orqali ketadi (Claude o'rniga).
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  production: process.env.NODE_ENV === "production",
  adminEmails: (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean),
  // Robbit ERP (admin.robbit.uz) integratsiyasi — server-to-server, faqat o'qish
  erp: {
    url: process.env.ROBBIT_ERP_URL ?? "https://api.robbit.uz",
    login: process.env.ROBBIT_ERP_LOGIN ?? "",
    password: process.env.ROBBIT_ERP_PASSWORD ?? "",
  },
};
