// Robbit ERP (admin.robbit.uz) integratsiyasi — server-to-server, FAQAT O'QISH.
//
// ERP tuzilishi (admin SPA bundle'idan aniqlangan):
//   Baza:     https://api.robbit.uz/api/staff
//   Auth:     POST /auth/sign-in   { login, password }  -> { data: { accessToken, refreshToken } }
//             GET  /auth/refresh-token  (Bearer token bilan)  -> yangi token
//   Javob:    { success: boolean, data: T, error: { errId, isFriendly, errMsg } | null }
//
// Kredensiallar KODGA yozilmaydi — faqat .env dan o'qiladi (ROBBIT_ERP_LOGIN / _PASSWORD).
// CORS admin.robbit.uz uchun yopiq, shu sabab bu kod faqat backend'da ishlaydi (brauzerda emas).
//
// MUHIM: ERP oldidagi gateway ba'zan 417 (Expectation Failed) qaytaradi — beqaror
// (node round-robin). Shu sabab har so'rov qisqa retry bilan yuboriladi.

const BASE = (process.env.ROBBIT_ERP_URL ?? "https://api.robbit.uz").replace(/\/$/, "");
const PREFIX = "/api/staff";
const LOGIN = process.env.ROBBIT_ERP_LOGIN ?? "";
const PASSWORD = process.env.ROBBIT_ERP_PASSWORD ?? "";

export function erpConfigured(): boolean {
  return Boolean(LOGIN && PASSWORD);
}

interface ErpEnvelope<T> {
  success: boolean;
  data: T;
  error: { errId: number; isFriendly: boolean; errMsg: string } | null;
}

// Token keshi — modul darajasida (bitta backend instansiyasi). Muddati tugasa qayta login.
let accessToken: string | null = null;
let tokenExpiresAt = 0; // ms; taxminiy (JWT exp'dan olinadi, bo'lmasa 50 daqiqa)

class ErpError extends Error {
  constructor(message: string, readonly status?: number, readonly errId?: number) {
    super(message);
    this.name = "ErpError";
  }
}

// JWT payload'idan exp (soniya) ni o'qib, ms muddatni qaytaradi (imzoni tekshirmaydi —
// faqat qachon yangilashni bilish uchun). O'qib bo'lmasa 0.
function jwtExpiryMs(token: string): number {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof json.exp === "number" ? json.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

// ERP gateway'i brauzer sarlavhalarini talab qiladi (Origin/langid/app_version/UA).
// Bularsiz yoki `Expect: 100-continue` bilan 417 (Expectation Failed) qaytaradi.
// Shu sabab har so'rovga shu sarlavhalarni qo'shamiz. (Node fetch Expect yubormaydi.)
const BROWSER_HEADERS: Record<string, string> = {
  Origin: "https://admin.robbit.uz",
  Referer: "https://admin.robbit.uz/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  langid: "uz",
  app_version: "1.0.0",
};

// Bitta HTTP so'rov — 417 (beqaror gateway) bo'lsa qisqa kutib qayta uriniladi.
async function rawFetch(path: string, init: RequestInit, tries = 3): Promise<Response> {
  const url = `${BASE}${PREFIX}${path}`;
  const headers = { ...BROWSER_HEADERS, ...(init.headers as Record<string, string> | undefined) };
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { ...init, headers });
    if (res.status !== 417) return res; // 417 dan boshqasi — darhol qaytaramiz
    last = res;
    await new Promise((r) => setTimeout(r, 250 * (i + 1))); // 250ms, 500ms...
  }
  return last!;
}

async function login(): Promise<void> {
  if (!erpConfigured()) {
    throw new ErpError("ERP kredensiallari sozlanmagan (ROBBIT_ERP_LOGIN / ROBBIT_ERP_PASSWORD)");
  }
  const res = await rawFetch("/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
  });
  const body = (await res.json().catch(() => null)) as ErpEnvelope<{
    accessToken: string;
    refreshToken: string;
    staffInfo?: unknown;
  }> | null;
  if (!res.ok || !body?.success || !body.data?.accessToken) {
    throw new ErpError(body?.error?.errMsg ?? `ERP login xatosi (${res.status})`, res.status, body?.error?.errId);
  }
  accessToken = body.data.accessToken;
  const exp = jwtExpiryMs(accessToken);
  // exp bo'lmasa 50 daqiqa; bo'lsa 60s zaxira bilan
  tokenExpiresAt = exp > Date.now() ? exp - 60_000 : Date.now() + 50 * 60_000;
}

async function ensureToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;
  await login();
  return accessToken!;
}

// Autentifikatsiyalangan GET — 401 bo'lsa bir marta qayta login qilib takrorlaydi.
async function get<T>(path: string): Promise<T> {
  const token = await ensureToken();
  const doReq = (t: string) =>
    rawFetch(path, { method: "GET", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } });

  let res = await doReq(token);
  if (res.status === 401) {
    // Token eskirgan bo'lishi mumkin — qayta login qilib bir marta takrorlaymiz
    accessToken = null;
    const fresh = await ensureToken();
    res = await doReq(fresh);
  }
  const body = (await res.json().catch(() => null)) as ErpEnvelope<T> | null;
  if (!res.ok || !body?.success) {
    throw new ErpError(body?.error?.errMsg ?? `ERP so'rov xatosi (${res.status}) — ${path}`, res.status, body?.error?.errId);
  }
  return body.data;
}

/**
 * Xom (typed emas) GET — javob shakli hali noma'lum endpointlarni o'rganish uchun.
 * Test skripti (scripts/erp-test.mjs) shu orqali javob tuzilishini ko'rsatadi.
 */
export function erpGetRaw<T = unknown>(path: string): Promise<T> {
  return get<T>(path);
}

// Auth ishlayotganini tekshirish — token oladi.
export async function erpPing(): Promise<{ ok: true }> {
  await ensureToken();
  return { ok: true };
}

// Sahifalangan ro'yxatni to'liq yig'ish — ERP 100 tadan qaytaradi (`{ total, <arr> }`).
// arrKey — javobdagi massiv maydoni nomi ("students" | "groups").
async function getAllPaged<T>(path: string, arrKey: string, size = 100): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page < 1000; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await get<Record<string, unknown>>(`${path}${sep}page=${page}&size=${size}`);
    const chunk = (data?.[arrKey] as T[] | undefined) ?? [];
    out.push(...chunk);
    const total = Number(data?.total ?? out.length);
    if (chunk.length === 0 || out.length >= total) break;
  }
  return out;
}

// ---- O'qish metodlari ----
// Ishlaydigan endpointlar (Ikromjon/roleId 5 akkaunti bilan tasdiqlangan):
//   /students/all  — { total, students: [...] }   (sahifalangan)
//   /groups/all    — { total, groups: [...] }      (sahifalangan)
// Ruxsat talab qiladiganlar (hozir 404): /teacher/all, /attendances — superadmin
// yoki tegishli rol kerak. ERP jamoasi ruxsat bergach shu yerga qo'shiladi.

export const erp = {
  // Barcha o'quvchilar (sahifalar avtomatik yig'iladi)
  students: () => getAllPaged<Record<string, unknown>>("/students/all", "students"),
  // Barcha guruhlar
  groups: () => getAllPaged<Record<string, unknown>>("/groups/all", "groups"),
};

export { ErpError };
