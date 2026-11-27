import sanitizeHtml from "sanitize-html";

// ---- Dars matni (Quill tahrirlagichidan kelgan HTML) uchun xavfsiz tozalash ----
// Matn boshqa ustozlarga ko'rsatiladi, shuning uchun faqat ruxsat etilgan teglar va
// atributlar qoladi: script, style, on*-hodisalar, javascript: havolalar — olib tashlanadi.

const QUILL_CLASS = /^ql-(indent-[1-8]|align-(center|right|justify)|size-(small|large|huge)|font-(serif|monospace)|syntax)$/;

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s", "blockquote", "pre", "code", "ol", "ul", "li", "a", "span"],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    li: ["data-list", "class"],
    pre: ["class", "data-language", "spellcheck"],
    "*": ["class"],
  },
  allowedClasses: { "*": [QUILL_CLASS] },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  // Havolalar doim yangi oynada va xavfsiz ochiladi
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
  },
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Teg yo'q oddiy matn (eski yozuvlar) — qatorlarni paragraflarga aylantiradi. */
export function plainToHtml(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `<p>${line.trim() ? escapeHtml(line) : "<br>"}</p>`)
    .join("");
}

export function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(s);
}

/** Dars matnini tozalaydi. Ko'rinadigan matn bo'lmasa — bo'sh satr (bo'lim yashirinadi). */
export function sanitizeLessonHtml(input: string): string {
  const src = input.trim();
  const html = sanitizeHtml(looksLikeHtml(src) ? src : plainToHtml(src), OPTIONS).trim();
  const visible = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;/g, " ").trim();
  return visible ? html : "";
}
