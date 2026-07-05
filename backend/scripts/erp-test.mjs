// Robbit ERP integratsiyasini LOKAL sinash — kredensiallar .env dan o'qiladi.
//
// Ishlatish (backend papkasida):
//   1) .env ga ROBBIT_ERP_LOGIN va ROBBIT_ERP_PASSWORD ni qo'ying
//   2) node scripts/erp-test.mjs           -> login + profil + har endpointdan namuna
//      node scripts/erp-test.mjs /students/all   -> aynan bir endpointning xom javobi
//
// Bu skript ekranga faqat javob TUZILISHINI (maydon nomlari, nechta yozuv) chiqaradi;
// to'liq shaxsiy ma'lumotlarni emas. Natijaga qarab keyin aniq TypeScript tiplarini yozamiz.

import "dotenv/config";

const BASE = (process.env.ROBBIT_ERP_URL ?? "https://api.robbit.uz").replace(/\/$/, "");
const PREFIX = "/api/staff";
const LOGIN = process.env.ROBBIT_ERP_LOGIN ?? "";
const PASSWORD = process.env.ROBBIT_ERP_PASSWORD ?? "";

if (!LOGIN || !PASSWORD) {
  console.error("❌ .env da ROBBIT_ERP_LOGIN / ROBBIT_ERP_PASSWORD yo'q");
  process.exit(1);
}

// Gateway brauzer sarlavhalarini talab qiladi (aks holda 417)
const BROWSER_HEADERS = {
  Origin: "https://admin.robbit.uz",
  Referer: "https://admin.robbit.uz/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  langid: "uz",
  app_version: "1.0.0",
};

async function req(path, init, tries = 3) {
  const url = `${BASE}${PREFIX}${path}`;
  const headers = { ...BROWSER_HEADERS, ...(init.headers ?? {}) };
  let last;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { ...init, headers });
    if (res.status !== 417) return res;
    last = res;
    await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  return last;
}

// Javob tuzilishini xavfsiz ko'rsatish (qiymatlarni emas, shaklni)
function shape(v, depth = 0) {
  if (Array.isArray(v)) {
    return `Array(${v.length})` + (v.length ? ` of ${shape(v[0], depth + 1)}` : "");
  }
  if (v && typeof v === "object") {
    if (depth > 2) return "{…}";
    const keys = Object.keys(v).slice(0, 30);
    return "{ " + keys.map((k) => `${k}: ${shape(v[k], depth + 1)}`).join(", ") + " }";
  }
  return typeof v;
}

async function main() {
  console.log(`ERP: ${BASE}${PREFIX}  ·  login: ${LOGIN.slice(0, 3)}***\n`);

  // 1) Login
  const loginRes = await req("/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
  });
  const loginBody = await loginRes.json().catch(() => null);
  if (!loginRes.ok || !loginBody?.success || !loginBody.data?.accessToken) {
    console.error(`❌ Login xatosi (${loginRes.status}):`, loginBody?.error?.errMsg ?? loginBody);
    process.exit(1);
  }
  const token = loginBody.data.accessToken;
  console.log("✅ Login OK. accessToken olindi, refreshToken:", Boolean(loginBody.data.refreshToken));
  console.log("   token payload:", (() => {
    try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); } catch { return "?"; }
  })(), "\n");

  const authGet = async (path) => {
    const res = await req(path, { method: "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
    const body = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, body };
  };

  // Argument berilsa — faqat o'sha endpoint (to'liq JSON)
  const only = process.argv[2];
  if (only) {
    const r = await authGet(only);
    console.log(`GET ${only}  ->  ${r.status}`);
    console.log(JSON.stringify(r.body, null, 2).slice(0, 4000));
    return;
  }

  // Aks holda — asosiy endpointlardan tuzilma namunasi
  const endpoints = ["/staff-profile", "/teacher/all", "/groups/all", "/students/all", "/group-students"];
  for (const ep of endpoints) {
    try {
      const r = await authGet(ep);
      if (!r.ok || !r.body?.success) {
        console.log(`⚠️  GET ${ep}  ->  ${r.status}  ${r.body?.error?.errMsg ?? ""}`);
      } else {
        console.log(`✅ GET ${ep}  ->  ${r.status}`);
        console.log("   shape:", shape(r.body.data), "\n");
      }
    } catch (e) {
      console.log(`❌ GET ${ep}  ->  ${e.message}`);
    }
  }
  console.log("Tugadi. Aniq endpoint javobini ko'rish: node scripts/erp-test.mjs /students/all");
}

main().catch((e) => { console.error(e); process.exit(1); });
