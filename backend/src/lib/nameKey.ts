// YUMSHOQ kalit — FAQAT statistika/tahlil moslashtirishida ishlatiladi.
// nameKey'ga (roster/approved hisobi) ATAYLAB tegilmaydi: u DB'da saqlanadi
// (RosterTeacher.nameKey), o'zgartirilsa tasdiqlash tizimi buzilardi.
// Farqlarni yo'q qiladi: apostrof variantlari (G'ofurov / Gʻofurov / Gofurov)
// va x↔h translitaratsiyasi (Xakimov ~ Hakimov, Baxromov ~ Bahromov).
export function looseNameKey(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[`'ʻʼ‘’´]/g, "") // apostroflarni butunlay olib tashlaymiz
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/x/g, "h") // Xakimov ~ Hakimov
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}

// Ism-familiyani moslashtirish uchun normalizatsiya.
// Tartibga bog'liq emas: "Bobonova Gulnoza" == "Gulnoza Bobonova".
export function nameKey(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[`'']/g, "'") // apostrof variantlarini birlashtirish
    .replace(/[^a-z0-9'\s]/g, " ") // ortiqcha belgilarni bo'shliqqa
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .sort()
    .join(" ");
}
