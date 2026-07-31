// Toifa oshirish talablari — "Toifalar — talablar va vazifalar" hujjatidagi matn asosida.
// KPI (uy vazifa/davomat/ketgan/kech tekshirish/kechikish) allaqachon services/analysis.ts
// da avtomatik hisoblanadi (REQUIREMENTS); bu yerda faqat QO'LDA tekshiriladigan
// (metodik ishlar, kasbiy rivojlanish, sertifikatlar) vazifalar ro'yxati turadi.

export interface ChecklistItem {
  key: string;
  label: string;
}

export interface TierRequirement {
  toTier: number;
  roleName: string; // lavozim nomi
  minExperience: string; // eligibilligi (ma'lumot uchun, avtomatik tekshirilmaydi)
  checklist: ChecklistItem[];
}

export const TIER_REQUIREMENTS: Record<number, TierRequirement> = {
  2: {
    toTier: 2,
    roleName: "Ustoz",
    minExperience: "\"Kichik ustoz\" sifatida kamida 4 oy muvaffaqiyatli ish tajribasi (kamida 2 ta guruh bilan)",
    checklist: [
      { key: "m1", label: "Yangi mavzular bo'yicha 5 ta to'liq dars taqdimotini mustaqil yaratish va metodistdan tasdiqlatish" },
      { key: "m2", label: "Mavjud dars rejasini takomillashtirish bo'yicha kamida 3 ta asoslangan yozma taklif kiritish" },
      { key: "k1", label: "Boshqa ustozlarga 2 ta mavzuda (pedagogik, texnik yoki shaxsiy rivojlanish) master-klass o'tib berish (dars taqdimoti, kuzatuvchilar xulosalari va foto hisobot bilan)" },
      { key: "k2", label: "Yo'nalish bo'yicha qaysidir kursni muvaffaqiyatli tugatganligi bo'yicha sertifikat (Arduino/Python)" },
    ],
  },
  3: {
    toTier: 3,
    roleName: "Katta ustoz",
    minExperience: "\"Ustoz\" sifatida kamida 1 o'quv yili (taxminan 12 oy) muvaffaqiyatli ish tajribasi",
    checklist: [
      { key: "m1", label: "Yangi mavzular bo'yicha 10 ta to'liq dars taqdimotini mustaqil yaratish va metodistdan tasdiqlatish" },
      { key: "m2", label: "Yangi mini-loyiha ishlab chiqish (Arduino yoki EV3 asosida, kamida 3 darsga mo'ljallangan, to'liq dars rejalari va taqdimoti bilan)" },
      { key: "k1", label: "2 nafar \"Amaliyotchi ustoz\"ni \"Kichik ustoz\" bo'lib tasdiqlanishigacha mentorlik qilish" },
      { key: "k2", label: "1 nafar Kichik ustozga mentorlik qilish va ularni \"Ustoz\" toifasiga o'tishiga yordam berish" },
      { key: "k3", label: "O'z sohasi bo'yicha (masalan, \"Arduino C++\", \"App Inventor\", \"3D modellashtirish\") tashqi kursda o'qish yoki sertifikat olish" },
      { key: "e1", label: "Ingliz tili bo'yicha B1 sertifikati" },
    ],
  },
  4: {
    toTier: 4,
    roleName: "Yetakchi ustoz",
    minExperience: "\"Katta ustoz\" sifatida kamida 1.5 o'quv yili (18 oy) muvaffaqiyatli ish tajribasi va sezilarli metodik hissa",
    checklist: [
      { key: "m1", label: "Mavzular bo'yicha 15 ta to'liq dars taqdimotini YOKI 1 ta o'quv moduli dasturi va dars taqdimotlarini to'liq mustaqil yaratish va metodistdan tasdiqlatish" },
      { key: "k1", label: "Muayyan texnologiya, modul yoki pedagogika bo'yicha metodik guruh (working group) shakllantirish va boshqarish (masalan IoT, Scratch, 3D)" },
      { key: "k2", label: "Ta'lim sohasidagi nashrlarda maqola chop etish yoki konferensiyalarda ma'ruza qilish (Robbit Akademiyasi nomidan)" },
      { key: "e1", label: "Ingliz tili bo'yicha B2 sertifikati" },
      { key: "e2", label: "O'quvchilarning musobaqalardagi sovrinli o'rinlari (1,2,3): kamida 2 ta mavsumiy musobaqa, 1 ta respublika darajasidagi musobaqa" },
    ],
  },
};

// Ariza faqat har oyning 1-10 sanasida qabul qilinadi ("Toifalar" hujjatidagi qoida).
export function isSubmitWindowOpen(now = new Date()): boolean {
  const d = now.getDate();
  return d >= 1 && d <= 10;
}
