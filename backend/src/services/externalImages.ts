import fs from "fs";
import path from "path";
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

// Bitta tashqi rasmni yuklab oladi. Har qanday muammoda (xavfli URL, katta hajm,
// rasm emas, timeout) ok:false + sabab qaytaradi — chaqiruvchi o'tkazib yuboradi.
export async function fetchExternalImage(rawUrl: string, maxBytes: number): Promise<FetchedImage> {
  const url = safeExternalUrl(rawUrl);
  if (!url) return { ok: false, reason: "xavfli URL" };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        Accept: "image/*",
        // Ba'zi CDN'lar (hotlink himoyasi) Referer'siz so'rovni rad etadi
        Referer: `${url.origin}/`,
      },
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const mediaType = MEDIA_BY_CONTENT_TYPE[ct];
    if (!mediaType) return { ok: false, reason: `rasm emas (${ct || "content-type yo'q"})` };
    const len = Number(res.headers.get("content-length"));
    if (Number.isFinite(len) && len > maxBytes) return { ok: false, reason: "hajmi katta" };
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0) return { ok: false, reason: "bo'sh javob" };
    if (buffer.byteLength > maxBytes) return { ok: false, reason: "hajmi katta" };
    return { ok: true, mediaType, buffer };
  } catch (e) {
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
