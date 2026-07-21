// AI qaytargan savollarning javob variantlarini ARALASHTIRADI.
//
// Nega kerak: model deyarli har doim to'g'ri javobni birinchi (A) variant qilib
// qo'yadi. Promptda "aralashtir" deb yozish ishonchsiz — model baribir tartibga
// qaytadi. Shuning uchun tartibni KOD kafolatlaydi: generatsiyadan keyin har
// savolning variantlari Fisher–Yates bilan aralashtiriladi.
//
// TRUE_FALSE tegilmaydi: u yerda variantlar "To'g'ri"/"Noto'g'ri" degan qat'iy
// yorliqlar — ularni joyini almashtirish o'quvchini chalg'itadi. U turdagi
// bir xillikka promptdagi qoida qarshi turadi (yarmi "Noto'g'ri" bo'lsin).

export interface ShuffleOption {
  text: string;
  isCorrect: boolean;
}
export interface ShuffleQuestion {
  type: string;
  options?: ShuffleOption[];
}

// Fisher–Yates — har o'rin teng ehtimollik bilan
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Har savolning variantlarini aralashtirib, YANGI massiv qaytaradi (kirish o'zgarmaydi).
export function shuffleAnswerOptions<T extends ShuffleQuestion>(questions: T[]): T[] {
  return questions.map((q) => {
    if (q.type === "TRUE_FALSE") return q;
    if (!Array.isArray(q.options) || q.options.length < 2) return q;
    return { ...q, options: shuffled(q.options) };
  });
}
