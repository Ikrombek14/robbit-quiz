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
