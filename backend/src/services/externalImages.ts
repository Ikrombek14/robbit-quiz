import fs from "fs";
import path from "path";
import https from "https";
import type { SlideImage } from "./claude.js";
import { UPLOADS_DIR } from "../routes/upload.js";

// Tashqi (https) rasmlarni xavfsiz yuklab olish — ikki joyda ishlatiladi:
//  1) AI savol generatsiyasi: Wayground'dan import qilingan quizlarda rasmlar
//     tashqi CDN'da (media.quizizz.com) turadi — ularni AI'ga berish uchun olamiz.
//  2) Wayground import: rasmlarni uploads/ ga ko'chirib, quizni tashqi CDN'ga
//     bog'liq qilmaymiz (CDN'dan o'chsa ham bizda qoladi).

const FETCH_TIMEOUT_MS = 15_000;

// Content-Type → bizning media turlarimiz (SlideImage bilan bir xil)
const MEDIA_BY_CONTENT_TYPE: Record<string, SlideImage["mediaType"]> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg", // ba'zi CDN'lar shunday qaytaradi
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

const EXT_BY_MEDIA: Record<SlideImage["mediaType"], string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

// SSRF himoyasi: faqat https, ochiq internetdagi domen nomlari (IP/localhost emas)
function safeExternalUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null; // IPv4 literal
  if (host.includes(":")) return null; // IPv6 literal
  return url;
}

export type FetchedImage =
  | { ok: true; mediaType: SlideImage["mediaType"]; buffer: Buffer }
  | { ok: false; reason: string }; // diagnostika uchun qisqa sabab (xato xabariga kiradi)

// Bitta HTTP javob (redirect'ga ergashilmaydi — chaqiruvchi o'zi boshqaradi)
type RawImgResp = { status: number; contentType: string; location: string | null; waf: boolean; buffer: Buffer };

class TooLargeError extends Error {}

// IPv4 (oddiy fetch). Tana maxBytes dan oshsa TooLargeError.
async function getViaIPv4(url: URL, headers: Record<string, string>, maxBytes: number): Promise<RawImgResp> {
  const res = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const len = Number(res.headers.get("content-length"));
  if (Number.isFinite(len) && len > maxBytes) throw new TooLargeError();
  const buffer = res.status >= 300 && res.status < 400 ? Buffer.alloc(0) : Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new TooLargeError();
  return {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    location: res.headers.get("location"),
    waf: res.headers.has("x-amzn-waf-action"),
    buffer,
  };
}

// IPv6 orqali (Wayground/Quizizz AWS WAF serverimizning IPv4 manzilini bot deb bloklaydi —
// 202 + bo'sh tana; IPv6 manzil esa ochiq. Qarang: routes/import.ts getWayground).
function getViaIPv6(url: URL, headers: Record<string, string>, maxBytes: number): Promise<RawImgResp> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, family: 6, timeout: 8_000 }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.byteLength;
        if (size > maxBytes) { req.destroy(new TooLargeError()); return; }
        chunks.push(c);
      });
      res.on("end", () => {
        const loc = res.headers.location;
        resolve({
          status: res.statusCode ?? 0,
          contentType: String(res.headers["content-type"] ?? ""),
          location: typeof loc === "string" ? loc : null,
          waf: Boolean(res.headers["x-amzn-waf-action"]),
          buffer: Buffer.concat(chunks),
        });
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

// WAF "challenge" javobi: x-amzn-waf-action sarlavhasi yoki 202 + bo'sh tana
const isWafBlock = (r: RawImgResp) => r.waf || (r.status === 202 && r.buffer.byteLength === 0);

const MAX_REDIRECTS = 5;

// Bitta tashqi rasmni yuklab oladi. Har qanday muammoda (xavfli URL, katta hajm,
// rasm emas, timeout) ok:false + sabab qaytaradi — chaqiruvchi o'tkazib yuboradi.
// Redirect'lar qo'lda kuzatiladi: har bir yangi manzil ham safeExternalUrl tekshiruvidan
// o'tadi (SSRF). Javob WAF bloki bo'lsa (2026-10-24: media.quizizz.com → quizizz.com
// IPv4'da 202 bo'sh HTML, "rasm emas (text/html)") — o'sha manzil IPv6 orqali qayta so'raladi.
export async function fetchExternalImage(rawUrl: string, maxBytes: number): Promise<FetchedImage> {
  let url = safeExternalUrl(rawUrl);
  if (!url) return { ok: false, reason: "xavfli URL" };
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const headers: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        // Ba'zi CDN'lar (hotlink himoyasi) Referer'siz so'rovni rad etadi
        Referer: `${url.origin}/`,
      };
      let res = await getViaIPv4(url, headers, maxBytes);
      if (isWafBlock(res)) {
        try {
          const v6 = await getViaIPv6(url, headers, maxBytes);
          if (!isWafBlock(v6)) res = v6;
        } catch (e) {
          if (e instanceof TooLargeError) throw e;
          /* IPv6 yo'q yoki ulanmadi — IPv4 javobi bilan davom etamiz (pastda "rasm emas" bo'ladi) */
        }
      }
      if (res.status >= 300 && res.status < 400) {
        if (!res.location) return { ok: false, reason: `HTTP ${res.status} (manzilsiz redirect)` };
        const next = safeExternalUrl(new URL(res.location, url).toString());
        if (!next) return { ok: false, reason: "xavfli redirect" };
        url = next;
        continue;
      }
      if (res.status < 200 || res.status >= 300) return { ok: false, reason: `HTTP ${res.status}` };
      const ct = res.contentType.split(";")[0].trim().toLowerCase();
      const mediaType = MEDIA_BY_CONTENT_TYPE[ct];
      if (!mediaType) return { ok: false, reason: `rasm emas (${ct || "content-type yo'q"})` };
      if (res.buffer.byteLength === 0) return { ok: false, reason: "bo'sh javob" };
      return { ok: true, mediaType, buffer: res.buffer };
    }
    return { ok: false, reason: "redirect juda ko'p" };
  } catch (e) {
    if (e instanceof TooLargeError) return { ok: false, reason: "hajmi katta" };
    const name = e instanceof Error ? e.name : "";
    return { ok: false, reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "tarmoq xatosi" };
  }
}

// ---- Import paytida rasmlarni lokalizatsiya qilish ----

const LOCALIZE_MAX_IMAGES = 80; // bitta importda ko'pi bilan shuncha rasm ko'chiriladi
const LOCALIZE_MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const LOCALIZE_CONCURRENCY = 5;

const isExternal = (u: unknown): u is string => typeof u === "string" && /^https:\/\//i.test(u);

// Slayd data ichidagi barcha rasm joylarini topib beradi (o'qish + almashtirish uchun)
function forEachImageRef(slides: any[], fn: (url: string, set: (v: string) => void) => void): void {
  for (const s of slides) {
    const d = s?.data;
    if (!d) continue;
    if (isExternal(d.imageUrl)) fn(d.imageUrl, (v) => (d.imageUrl = v));
    if (d.background?.type === "image" && isExternal(d.background.value)) {
      fn(d.background.value, (v) => (d.background.value = v));
    }
    for (const el of Array.isArray(d.elements) ? d.elements : []) {
      if (el?.type === "image" && isExternal(el.url)) fn(el.url, (v) => (el.url = v));
    }
    for (const o of Array.isArray(d.options) ? d.options : []) {
      if (isExternal(o?.imageUrl)) fn(o.imageUrl, (v) => (o.imageUrl = v));
    }
  }
}

// Slaydlardagi tashqi rasmlarni uploads/ ga yuklab olib, URL'larni /uploads/<fayl>
// ga almashtiradi (slides massivi joyida o'zgaradi). Yuklab bo'lmagan rasm URL'i
// tegilmay qoladi — quiz baribir ishlayveradi (rasm CDN'dan ko'rinadi).
export async function localizeSlideImages(slides: any[]): Promise<{ saved: number; failed: number }> {
  const unique: string[] = [];
  forEachImageRef(slides, (url) => {
    if (!unique.includes(url) && unique.length < LOCALIZE_MAX_IMAGES) unique.push(url);
  });
  if (unique.length === 0) return { saved: 0, failed: 0 };

  const localByUrl = new Map<string, string>();
  let failed = 0;
  // 5 tadan parallel yuklaymiz — tez, lekin CDN'ni ham bombardimon qilmaymiz
  for (let i = 0; i < unique.length; i += LOCALIZE_CONCURRENCY) {
    const batch = unique.slice(i, i + LOCALIZE_CONCURRENCY);
    await Promise.all(
      batch.map(async (url) => {
        const img = await fetchExternalImage(url, LOCALIZE_MAX_IMAGE_BYTES);
        if (!img.ok) {
          failed++;
          console.warn(`[import] rasm ko'chirilmadi (${img.reason}): ${url.slice(0, 120)}`);
          return;
        }
        // upload.ts bilan bir xil nomlash uslubi
        const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${EXT_BY_MEDIA[img.mediaType]}`;
        try {
          fs.writeFileSync(path.join(UPLOADS_DIR, name), img.buffer);
          localByUrl.set(url, `/uploads/${name}`);
        } catch {
          failed++;
        }
      }),
    );
  }

  forEachImageRef(slides, (url, set) => {
    const local = localByUrl.get(url);
    if (local) set(local);
  });
  return { saved: localByUrl.size, failed };
}
