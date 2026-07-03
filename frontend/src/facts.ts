// Kutish ekranlarida ko'rsatiladigan qiziqarli faktlar (robototexnika, dasturlash, AI, fazo).
// Javob berib bo'lgach boshqalarni kutayotganda aylanib turadi — o'quvchi zerikmaydi.
export const FACTS: string[] = [
  "Birinchi sanoat roboti «Unimate» 1961-yilda General Motors zavodida ishlagan.",
  "«Robot» so'zi chexcha «robota» — «majburiy mehnat» so'zidan olingan (1920-yil).",
  "Dunyodagi birinchi dasturchi — ayol: Ada Lavleys, 1843-yilda algoritm yozgan.",
  "Birinchi kompyuter «bag»i — 1947-yilda kompyuter ichidan topilgan haqiqiy kapalak edi!",
  "Marsdagi Perseverance roveri kuniga o'rtacha atigi 100 metr yuradi — lekin juda aniq.",
  "Python tili ilon nomidan emas — «Monty Python» komediya guruhi nomidan olingan.",
  "Dunyoda har kuni 300 milliarddan ortiq elektron xat yuboriladi.",
  "Birinchi kompyuter sichqonchasi 1964-yilda yog'ochdan yasalgan edi.",
  "Yaponiyada robotlar mehmonxonada ishlaydi — «Henn na Hotel»da ro'yxatga robot oladi.",
  "ChatGPT kabi AI modellari trillionlab so'zni «o'qib» o'rganadi.",
  "Eng kichik robot — inson sochidan ham ingichka, tomirlar ichida yura oladi.",
  "Minecraft dastlab atigi 6 kunda yozilgan edi.",
  "Internetdagi birinchi sayt hali ham ishlaydi: info.cern.ch (1991-yil).",
  "Boston Dynamics'ning Atlas roboti salto qila oladi va parkur o'ynaydi.",
  "Kosmosdagi astronavtlar bo'yi 5 sm gacha o'sadi — vaznsizlik tufayli.",
  "Birinchi videoo'yin 1958-yilda osteoskopda yaratilgan — «Tennis for Two».",
  "Bir soniyada superkompyuter kvintillion (10^18) amal bajaradi.",
  "Arduino platasi Italiyadagi bar nomidan olingan — ixtirochilar o'sha yerda yig'ilishardi.",
  "Dunyodagi robotlarning yarmidan ko'pi Osiyoda ishlaydi.",
  "Google qidiruvi soniyada ~100 000 so'rovga javob beradi.",
  "Birinchi smartfon 1994-yilda chiqqan — IBM Simon, narxi 899 dollar edi.",
  "Scratch tilida 100 milliondan ortiq bola dasturlashni o'rgangan.",
  "Yer atrofida 8000 dan ortiq sun'iy yo'ldosh aylanmoqda.",
  "Tetris o'yini 1984-yilda Moskvada bitta dasturchi tomonidan yaratilgan.",
  "Inson miyasi ~86 milliard neyronga ega — eng kuchli «kompyuter» hali ham bizda!",
  "Drone'lar Afrikada dori-darmonlarni uzoq qishloqlarga yetkazadi.",
  "Birinchi elektron kompyuter ENIAC 27 tonna og'irlikda edi — butun xona hajmida.",
  "Wi-Fi texnologiyasi dastlab qora tuynuklarni izlash uchun ishlab chiqilgan.",
  "Lego yiliga 700 milliondan ortiq g'ildirakcha ishlab chiqaradi — dunyodagi eng katta «shina zavodi».",
  "AI shaxmat bo'yicha jahon chempionini birinchi marta 1997-yilda yenggan (Deep Blue).",
  "O'rtacha dasturchi kuniga atigi 10-50 qator «yakuniy» kod yozadi — qolgani o'ylash!",
  "QR-kod 1994-yilda Yaponiyada avtomobil zavodida ixtiro qilingan.",
];

// Tasodifiy fakt (oldingisidan farqli bo'lishiga harakat qiladi)
export function randomFact(prev?: string): string {
  if (FACTS.length < 2) return FACTS[0] ?? "";
  let f = FACTS[Math.floor(Math.random() * FACTS.length)];
  while (f === prev) f = FACTS[Math.floor(Math.random() * FACTS.length)];
  return f;
}
