import "dotenv/config";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  clientUrl: process.env.CLIENT_URL ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  production: process.env.NODE_ENV === "production",
};
