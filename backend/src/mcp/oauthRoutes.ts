import express, { Router, type Request, type Response, type NextFunction } from "express";
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { clientRegistrationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/register.js";
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js";
import { metadataHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/metadata.js";
import type { OAuthMetadata, OAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { config } from "../config.js";
import { oauthProvider, checkClientSecret, cleanupOAuth } from "./provider.js";
import { SCOPES } from "./scopes.js";
import { mcpResourceUrl } from "./security.js";

// OAuth endpoint'lari /oauth/* ostida (SDK'ning tayyor mcpAuthRouter'i ularni ildizga —
// /register, /authorize — qo'yadi; /register esa saytdagi ro'yxatdan o'tish sahifasi bilan
// to'qnashardi). Shuning uchun SDK handler'lari alohida, o'z yo'llarimizga ulanadi.

export function oauthMetadata(): OAuthMetadata {
  const base = config.mcp.issuerUrl;
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    revocation_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    scopes_supported: [...SCOPES],
    service_documentation: `${base}/guide`,
  };
}

function protectedResourceMetadata(): OAuthProtectedResourceMetadata {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [config.mcp.issuerUrl],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Robbit Quiz",
  };
}

// Confidential client secret'i bazada hash — SDK'ning o'z tekshiruvidan OLDIN biz tekshiramiz.
const verifyClientSecret = async (req: Request, res: Response, next: NextFunction) => {
  const clientId = typeof req.body?.client_id === "string" ? req.body.client_id : "";
  if (!clientId) return next(); // SDK o'zi invalid_request qaytaradi
  const secret = typeof req.body?.client_secret === "string" ? req.body.client_secret : undefined;
  const err = await checkClientSecret(clientId, secret);
  if (err) {
    res.status(400).json({ error: "invalid_client", error_description: err });
    return;
  }
  next();
};

export function oauthRouter(): Router {
  const router = Router();
  const urlencoded = express.urlencoded({ extended: false, limit: "50kb" });

  // Metadata (RFC 9728 + RFC 8414). Himoyalangan resurs metadata'si ham ildizda, ham
  // /mcp yo'li qo'shimchasi bilan beriladi — turli client'lar turlicha qidiradi.
  router.use("/.well-known/oauth-protected-resource/mcp", metadataHandler(protectedResourceMetadata()));
  router.use("/.well-known/oauth-protected-resource", metadataHandler(protectedResourceMetadata()));
  router.use("/.well-known/oauth-authorization-server", metadataHandler(oauthMetadata()));

  router.use("/oauth/authorize", authorizationHandler({ provider: oauthProvider }));
  router.use("/oauth/register", clientRegistrationHandler({ clientsStore: oauthProvider.clientsStore }));
  router.use("/oauth/token", urlencoded, verifyClientSecret, tokenHandler({ provider: oauthProvider }));
  router.use("/oauth/revoke", urlencoded, verifyClientSecret, revocationHandler({ provider: oauthProvider }));

  return router;
}

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
export function startOAuthCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    cleanupOAuth().catch((e) => console.error("[oauth] tozalash xatosi:", e instanceof Error ? e.message : e));
  }, 60 * 60 * 1000);
  cleanupTimer.unref();
}
