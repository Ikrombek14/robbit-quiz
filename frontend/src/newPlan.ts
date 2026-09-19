// Yangi 12 oylik o'quv dasturi (tasdiqlangan 2-variant) — Yo'l xaritasidagi "Yangi reja" uchun.
// Manba: robbit-yangi-oquv.netlify.app — matnlar so'zma-so'z. Statik ma'lumot, API kerak emas.

export interface PlanMonth {
  month: number;
  name: string;
  icon: string; // material-symbols
  desc: string;
  lessons: string[];
}
export interface PlanPhase {
  title: string;
  range: string;
  icon: string;
  tint: number; // Roadmap TINTS indeksi
  months: PlanMonth[];
}
export interface TrackMonth {
  month: number;
  name: string;
  desc: string;
  topics: string[];
}
export interface PlanTrack {
  title: string;
  icon: string;
  tint: number;
  months: TrackMonth[];
}

export const NEW_PLAN_PHASES: PlanPhase[] = [
  {
    title: "Dasturlash qismi",
    range: "1–6-oy",
    icon: "code",
    tint: 0,
    months: [
      {
        month: 1, name: "Kompyuter savodxonligi + AI", icon: "computer",
        desc: "Bola kompyuterda mustaqil ishlaydi va AI'dan to'g'ri foydalanishni o'rganadi.",
        lessons: [
          "Kompyuterning ichki va tashqi qurilmalari, ulardan foydalanish",
          "Typing (10 barmoq), hotkeys va sichqonchadan foydalanish",
          "Google servislari: Google imkoniyatlari va bepul toollar",
          "AI nima va qanday ishlaydi — Teachable Machine'da o'z AI modelini o'rgatish",
          "Birinchi suhbat: ChatGPT, Gemini, Claude — taqqoslash",
          "Prompt asoslari: yaxshi va yomon so'rov farqi",
          "Prompt formulasi: rol + vazifa + shart + misol",
          "AI xato qiladi: gallyutsinatsiya, javobni tekshirish, etika va xavfsizlik",
          "AI bilan rasm yaratish: matndan rasm, uslub va detallar",
          "AI bilan matn va taqdimot tayyorlash",
          "NotebookLM: o'z manbalaringiz asosida ishlaydigan AI",
          "Yakuniy loyiha: NotebookLM yordamida loyiha va himoya",
        ],
      },
      {
        month: 2, name: "Scratch", icon: "extension",
        desc: "Algoritmik fikrlash poydevori — bola bir oyda o'z o'yinlarini yaratadi.",
        lessons: [
          "Scratch: Costumes",
          "Scratch: Motion",
          "Scratch: Event 2 (Xabarlar bilan ishlash)",
          "Scratch: Loop animation",
          "Scratch: If else amaliyot (Labirint)",
          "Scratch: Clone",
          "Yordamchi Chat-Bot",
          "Scratch: List",
          "Scratch: Text to speach AI",
          "Scratch: My blocks",
          "Scratch: Yakuniy (O'yin tuzish)",
        ],
      },
      {
        month: 3, name: "Python Basic", icon: "terminal",
        desc: "Turtle grafikasidan boshlab, matnli kodning asoslari — har yangi tushuncha darrov o'yinda sinaladi.",
        lessons: [
          "Python: Turtle kutubxonasiga kirish",
          "Python: Turtle kutubxonasi 2-qism",
          "Turtle mini-loyiha: naqsh chizish",
          "Python: Kirish darsi",
          "Python: O'zgaruvchilar",
          "Python: String va Formating",
          "Python: Integer va Arifmetik amallar",
          "Mini o'yin: Kalkulyator",
          "Python: Boolean va If",
          "Python: If-elif-else",
          "Mini o'yin: Son topish (random)",
          "Mini o'yin: Tosh-qaychi-qog'oz",
        ],
      },
      {
        month: 4, name: "Python Advanced", icon: "data_object",
        desc: "Ro'yxatlar, sikllar, funksiyalar va class — yakunda to'liq dastur yoziladi.",
        lessons: [
          "Python: List va ular ustida amallar",
          "Python: List metodlari",
          "Python: For loop",
          "Python: While loop",
          "Python: Takrorlash uchun loyiha",
          "Mini o'yin: So'z topish (Hangman)",
          "Python: Lug'at",
          "Python: Funksiyalar",
          "Python: Class",
          "Python: Class metodlari",
          "Python: Ichki kutubxona",
          "Yakuniy loyiha: Mini Bank Hisob Dasturi",
        ],
      },
      {
        month: 5, name: "C++ Basic", icon: "code_blocks",
        desc: "Robototexnikaning asosiy tili. Python'dan tanish tushunchalar C++ sintaksisida qayta ishlanadi.",
        lessons: [
          "C++ bilan tanishuv: muhit va birinchi dastur (cout)",
          "O'zgaruvchilar va ma'lumot tiplari (int, float, char, bool, string)",
          "cin: foydalanuvchidan ma'lumot olish",
          "Arifmetik amallar va matematik funksiyalar",
          "Mini-loyiha: Kalkulyator",
          "Shartlar: if / else",
          "if — else if — else va mantiqiy amallar (&&, ||, !)",
          "switch — case",
          "Mini o'yin: Son topish (random)",
          "For loop",
          "While va do-while",
          "Mini o'yin: Tosh-qaychi-qog'oz",
        ],
      },
      {
        month: 6, name: "C++ Advanced", icon: "developer_board",
        desc: "Massivlar, funksiyalar va o'yinlar. Yakunda Arduino kodiga ko'prik quriladi.",
        lessons: [
          "Ichma-ich sikllar: naqsh va figuralar chizish",
          "Massivlar (array) bilan tanishuv",
          "Massivlar ustida amallar: yig'indi, eng katta va eng kichik",
          "Mini-loyiha: baholar jurnali",
          "String bilan ishlash",
          "Funksiyalar: yaratish va chaqirish",
          "Funksiyalar: parametr va qaytariladigan qiymat",
          "Mini o'yin: So'z topish (Hangman)",
          "Ikki o'lchamli massiv",
          "Mini o'yin: X-O (tic-tac-toe)",
          "Arduino kodiga ko'prik: setup / loop, pinMode, digitalWrite",
          "Yakuniy loyiha va himoya",
        ],
      },
    ],
  },
  {
    title: "Robototexnika qismi",
    range: "7–12-oy",
    icon: "precision_manufacturing",
    tint: 2,
    months: [
      {
        month: 7, name: "Spike", icon: "smart_toy",
        desc: "Birinchi haqiqiy robotlar — Word Blocks tili Scratch'ning o'zi, so'ng Spike Python.",
        lessons: [
          "Tanishuv darsi: Robototexnikaga kirish (Spike)",
          "Spike: Sound and Light bo'limi (Raqsga tushuvchi robot)",
          "Spike: Motors bo'limi, Basic Movements",
          "SPIKE Movements",
          "SPIKE Color sensor",
          "SPIKE Ultrasonic sensor",
          "SPIKE Musobaqa (Sumo)",
          "SPIKE Button",
          "SPIKE Gyro sensor",
          "Spike Python kirish",
          "SPIKE Python display va sound bo'limi",
          "Spike Python motor control",
        ],
      },
      {
        month: 8, name: "Elektronika", icon: "electrical_services",
        desc: "Robotning ichi: tok, sxema, komponentlar va payvandlash.",
        lessons: [
          "Elektronikaga kirish va xavfsizlik",
          "Tok, kuchlanish va zanjir",
          "O'tkazgichlar, izolyatorlar va qarshilik",
          "Breadbord va Multimetr bilan tanishuv",
          "Qarshilik — rezistor",
          "Diodlar oilasi",
          "Kondensator",
          "Tranzistor",
          "Button va rele",
          "Tungi chiroqlar (amaliy loyiha)",
          "Loyiha",
          "Loyiha",
        ],
      },
      {
        month: 9, name: "Arduino", icon: "memory",
        desc: "C++ kodi endi real qurilmalarni boshqaradi: LED, sensorlar va birinchi loyihalar.",
        lessons: [
          "Arduino nima? Arduino IDE, LED boshqaruvi",
          "Tugma, if-else, digitalRead() funksiyasi",
          "RGB chiroq va analogWrite(), for loop",
          "Potensiometr, analogRead() va map()",
          "Fotorezistor aqlli chiroq, serial aloqa",
          "Ovoz bilan ishlash, buzzer, analogmikrofon",
          "Mini o'yin: Simon Memory game",
          "Ultrasonik sensor",
          "Ultrasonik sensor bilan xavfsizlik tizimi",
          "Infraqizil pult va qabul qilgich",
          "Gas sensordan foydalanish",
          "Harorat va namlik sensori",
          "“O'simliklarga Qulaylik” loyihasi",
          "Smart eshik / deraza",
        ],
      },
      {
        month: 10, name: "Arduino Projects", icon: "directions_car",
        desc: "Motorlar, drayverlar va katta loyihalar: mashina, RFID va boshqariladigan robotlar.",
        lessons: [
          "Servo motor",
          "DC motorni tranzistor bilan boshqarish",
          "DC motorni L298N driver bilan boshqarish",
          "LCD displey, I2C modul",
          "Stepper motor",
          "Klaviatura (Keypad Parol tizimi qilish)",
          "7-segment displey",
          "Bluetooth modul nima?",
          "Bluetooth bilan L298 driver motorlarni boshqarish",
          "Car dasturlash",
          "Robotda energiya nazorati",
          "RFID modul nima?",
          "Arduino Car 1",
          "RFID modul bilan loyiha qilish",
        ],
      },
      {
        month: 11, name: "ESP32 Basic", icon: "bluetooth",
        desc: "Komponentlarni ESP32 bilan boshqarish, Bluetooth va Wi-Fi.",
        lessons: [
          "ESP32: Kirish",
          "ESP32: Button",
          "ESP32: GPIO, LDR, Potentsiometr",
          "ESP32: Buzzer",
          "ESP32: LCD, OLED display",
          "ESP32: Servo va Stepper motor",
          "ESP32: Keypad va Joystick",
          "ESP32: RFID va RTC modul",
          "ESP32: IR CAR",
          "ESP32: Bluetooth LED",
          "ESP32: Bluetooth RGB",
          "ESP32: Bluetooth car controller",
          "ESP32: WIFI",
        ],
      },
      {
        month: 12, name: "ESP32 Advanced", icon: "home_iot_device",
        desc: "Wi-Fi bilan aqlli uy va Blynk orqali mobil ilovadan boshqarish. Yakunda bitiruv loyihasi.",
        lessons: [
          "ESP32: WiFi sensor",
          "ESP32: WiFi Smart Home",
          "Blynk: Kirish",
          "Blynk: Mobil app",
          "Blynk: Servo",
          "Blynk: Ultrasonic",
          "Blynk: LCD",
          "Blynk: IR sensor",
          "Blynk: Keypad",
          "Blynk: RFID",
          "Blynk: Chart bilan ishlash",
          "Blynk: Aqlli tuvak (yakuniy loyiha)",
        ],
      },
    ],
  },
];

// 12 oylik dasturga kirmaydigan, bitirgandan keyin taklif qilinadigan kurslar (har biri 6 oy)
export const NEW_PLAN_EXTRA: PlanTrack[] = [
  {
    title: "Robototexnika — Loyiha qurish",
    icon: "rocket_launch",
    tint: 1,
    months: [
      { month: 1, name: "Arduino Musobaqa", desc: "Musobaqa robotlari va turnirlarga tayyorgarlik.",
        topics: ["Musobaqa roboti konstruksiyasi va strategiya", "Ichki saralash va turnirlar"] },
      { month: 2, name: "IoT Basic", desc: "IoT'ni chuqurlashtirish: boshqariladigan qurilmalar.",
        topics: ["Veb-joystik bilan boshqariladigan ESP32-mashina", "Bir nechta qurilmani yagona paneldan boshqarish"] },
      { month: 3, name: "IoT Advanced", desc: "Jonli video va murakkab IoT tizimlar.",
        topics: ["ESP32-CAM: jonli video-translyatsiya", "Katta IoT loyiha: aqlli tizim yig'ish"] },
      { month: 4, name: "ESP32 AI Integratsiya", desc: "AI va IoT uchrashadi.",
        topics: ["ESP32-CAM bilan obyektlarni aniqlash asoslari", "AI xizmatlarini ESP32'ga ulash"] },
      { month: 5, name: "ESP32 AI Projects", desc: "Aqlli qurilmalar: ko'radi va eshitadi.",
        topics: ["Ovozli buyruqlar bilan boshqarish", "Yuz va harakat aniqlash tajribalari"] },
      { month: 6, name: "ESP32 AI Projects", desc: "Yakuniy AI qurilma loyihasi.",
        topics: ["Shaxsiy AI + IoT loyihasi: g'oyadan qurilmagacha", "Katta himoya va taqdimot"] },
    ],
  },
  {
    title: "Frontend kursi — HTML, CSS, JavaScript",
    icon: "web",
    tint: 0,
    months: [
      { month: 1, name: "HTML", desc: "Veb-sahifaning skeleti: birinchi sayt tuzilishi.",
        topics: ["HTML teglar: sarlavha, matn, ro'yxat, havola", "Rasm, jadval va formalar", "Sahifa tuzilishi: header, main, footer", "Birinchi shaxsiy sahifa: «Men haqimda»"] },
      { month: 2, name: "CSS", desc: "Saytga jon kiritamiz: ranglar, shriftlar va joylashuv.",
        topics: ["Ranglar, shriftlar va o'lchamlar", "Blok modeli: margin, padding, border", "Flexbox: elementlarni joylashtirish", "Responsiv dizayn: telefonga moslash"] },
      { month: 3, name: "Sayt Project", desc: "HTML + CSS bilan to'liq shaxsiy sayt — internetga chiqadi.",
        topics: ["Sayt dizaynini rejalash (maket)", "Ko'p sahifali sayt yig'ish", "Saytni internetga joylash — bolaning o'z manzili bo'ladi", "Sayt himoyasi"] },
      { month: 4, name: "JavaScript Basic", desc: "Sayt endi harakatga keladi — Python bilimi yordam beradi.",
        topics: ["JS asoslari: o'zgaruvchilar, shartlar, sikllar", "Tugma va hodisalar: sahifa foydalanuvchiga javob beradi", "DOM: sahifa elementlarini kod bilan o'zgartirish", "Amaliyot: hisoblagich, rang almashtirgich"] },
      { month: 5, name: "JavaScript Advanced", desc: "Interaktiv dasturlar: o'yin va vidjetlar.",
        topics: ["Funksiyalar va massivlar amalda", "Kichik o'yin: viktorina yoki xotira o'yini", "Forma bilan ishlash va tekshirish", "Taymer, soat va vidjetlar"] },
      { month: 6, name: "Frontend Project", desc: "Yakuniy loyiha: to'liq interaktiv sayt.",
        topics: ["Shaxsiy g'oya: portfolio, o'yin yoki xizmat sayti", "HTML + CSS + JavaScript birgalikda", "Internetga joylash va katta himoya"] },
    ],
  },
];
