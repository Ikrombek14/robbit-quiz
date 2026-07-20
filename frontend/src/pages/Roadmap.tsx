import { useState } from "react";
import Shell from "../components/Shell";

// Robbit yo'l xaritasi — PDF roadmapning saytdagi jonli, moslashuvchan ko'rinishi.
// 4 ta "sahifa" = 2 yo'nalish × 2 yosh toifasi. Har biri 3 ta modul, har modulda
// 3 bosqich (nom + oy oralig'i). Ma'lumot statik — API kerak emas.

type Subject = "ROBOTEXNIKA" | "DASTURLASH";
type Age = "9-11" | "12-15";

interface Stage {
  title: string;
  months: string;
}
interface Module {
  name: string;
  icon: string; // material-symbols
  tint: number; // 0..2 — rang indeksi
  desc: string;
  stages: [Stage, Stage, Stage];
}
interface Roadmap {
  subject: Subject;
  age: Age;
  months: number; // umumiy davomiyligi
  intro: string[];
  modules: [Module, Module, Module];
}

// Modul ranglari — brend pastel palitrasi, alfa past bo'lgani uchun ikkala mavzuda ham o'qiladi
const TINTS = [
  { soft: "rgba(74, 111, 165, 0.12)", line: "#4a6fa5" }, // ko'k
  { soft: "rgba(139, 96, 232, 0.12)", line: "#8b60e8" }, // binafsha
  { soft: "rgba(95, 143, 68, 0.14)", line: "#5f8f44" }, // yashil
];

const ROADMAPS: Roadmap[] = [
  {
    subject: "ROBOTEXNIKA", age: "9-11", months: 18,
    intro: [
      "Robbit Akademiyasida o'quv dasturi 3 ta modul asosida tuzilgan: Loyihalash, Dasturlash va Robototexnika. Bu modullar o'zaro mantiqiy bog'liq — o'quvchi 3D dizaynda chizgan detalini robototexnikada real robotga aylantiradi, dasturlashda esa unga kod yozib jonlantiradi.",
      "Darslar STEAM asosida, haftada 3 kun, 3 modul parallel olib boriladi. Har bir dars amaliy loyiha yasash bilan yakunlanadi.",
    ],
    modules: [
      {
        name: "Loyihalash (3D)", icon: "deployed_code", tint: 0,
        desc: "Tinkercad'dan Onshape professional 3D dizayngacha — modellashtirish va detallarni 3D printerdan chiqarish.",
        stages: [
          { title: "Tinkercad — 3D asoslar", months: "1–2-oy" },
          { title: "Onshape — modellash", months: "3–6-oy" },
          { title: "3D print loyihalar", months: "7–12-oy" },
        ],
      },
      {
        name: "Dasturlash", icon: "code", tint: 1,
        desc: "Scratch o'yinlaridan Python'ga, so'ng App Inventor mobil ilovalar va Web dasturlash asoslariga.",
        stages: [
          { title: "Scratch o'yinlar", months: "1–2-oy" },
          { title: "Python + Turtle", months: "4–7-oy" },
          { title: "App Inventor + Web", months: "8–18-oy" },
        ],
      },
      {
        name: "Robototexnika", icon: "smart_toy", tint: 2,
        desc: "WeDo 2.0 mexanizmlaridan Spike Prime, so'ng Arduino musobaqa robotlari va IoT ESP32 loyihalariga.",
        stages: [
          { title: "WeDo 2.0 mexanizmlar", months: "1–2-oy" },
          { title: "Spike Prime robotlar", months: "3–6-oy" },
          { title: "Arduino + IoT ESP32", months: "7–18-oy" },
        ],
      },
    ],
  },
  {
    subject: "ROBOTEXNIKA", age: "12-15", months: 12,
    intro: [
      "O'quv dasturi 3 ta modul asosida tuzilgan: Loyihalash, Dasturlash va Robototexnika. Modullar o'zaro bog'liq — 3D dizayndagi detal real robotga aylanadi, dasturlashda unga kod yoziladi.",
      "Darslar STEAM asosida, haftada 3 kun, 3 modul parallel. Har bir dars amaliy loyiha bilan yakunlanadi.",
    ],
    modules: [
      {
        name: "Loyihalash (3D)", icon: "deployed_code", tint: 0,
        desc: "Spike va Tinkercad'dan Onshape'da professional 3D dizayn, arxitektura va robot detallari.",
        stages: [
          { title: "Tinkercad + Spike", months: "1–2-oy" },
          { title: "Onshape professional", months: "3–4-oy" },
          { title: "3D print detallar", months: "5–12-oy" },
        ],
      },
      {
        name: "Dasturlash", icon: "code", tint: 1,
        desc: "Scratch mantiqidan Python katta loyihalar (Bank tizimi, ToDo) va App Inventor mobil ilovalarga.",
        stages: [
          { title: "Scratch mantiq", months: "1–2-oy" },
          { title: "Python loyihalar", months: "3–6-oy" },
          { title: "App Inventor ilovalar", months: "7–12-oy" },
        ],
      },
      {
        name: "Robototexnika", icon: "smart_toy", tint: 2,
        desc: "Spike musobaqalari (FLL, WRO), Elektronika va Arduino, so'ng IoT ESP32 aqlli uy loyihalari.",
        stages: [
          { title: "Spike + FLL/WRO", months: "1–4-oy" },
          { title: "Elektronika + Arduino", months: "5–9-oy" },
          { title: "IoT ESP32 + Blynk", months: "10–12-oy" },
        ],
      },
    ],
  },
  {
    subject: "DASTURLASH", age: "9-11", months: 24,
    intro: [
      "Dasturlash yo'nalishi bosqichma-bosqich qurilgan: o'quvchi avval Scratch orqali dasturlash mantiqini o'rganadi, so'ng Figma'da dizayn chizib, uni HTML, CSS va JavaScript yordamida jonli veb-saytga aylantiradi. Keyin Python, ma'lumotlar bazasi, API va Telegram botlar orqali to'laqonli dasturchi ko'nikmalarini egallaydi.",
      "Har bir ish GitHub portfolioga yig'iladi. Yo'nalish yakunida o'quvchi o'z dizayni, veb-sayti va Telegram boti bo'lgan bitta katta startap loyihasini mustaqil yaratib, taqdim etadi.",
    ],
    modules: [
      {
        name: "Dizayn & Frontend", icon: "web", tint: 0,
        desc: "Scratch o'yinlaridan Figma dizayn va Framer prototipga, so'ng HTML/CSS/JS interaktiv saytlarga.",
        stages: [
          { title: "Scratch o'yinlar", months: "1–2-oy" },
          { title: "Figma + Framer", months: "3–4-oy" },
          { title: "HTML/CSS/JS saytlar", months: "5–12-oy" },
        ],
      },
      {
        name: "Python", icon: "code", tint: 1,
        desc: "Python asoslaridan sikllar, funksiyalar va OOP'gacha — klasslar bilan murakkab dasturlar tuzish.",
        stages: [
          { title: "Python asoslar", months: "13–15-oy" },
          { title: "Funksiyalar & sikllar", months: "15–16-oy" },
          { title: "Python OOP", months: "17–18-oy" },
        ],
      },
      {
        name: "Bot & Startap", icon: "smart_toy", tint: 2,
        desc: "Telegram bot (aiogram), SQLite ma'lumotlar bazasi, API — va yakuniy katta startap loyihasi.",
        stages: [
          { title: "SQLite + API", months: "20–21-oy" },
          { title: "Telegram bot (aiogram)", months: "19–22-oy" },
          { title: "Final startap loyiha", months: "23–24-oy" },
        ],
      },
    ],
  },
  {
    subject: "DASTURLASH", age: "12-15", months: 18,
    intro: [
      "Dasturlash yo'nalishi bosqichma-bosqich qurilgan: avval Scratch orqali dasturlash mantiqi, so'ng Figma'da dizayn va uni HTML, CSS, JavaScript bilan jonli veb-saytga aylantirish. Keyin Python, ma'lumotlar bazasi, API va Telegram botlar bilan to'laqonli dasturchi ko'nikmalari.",
      "Har bir ish GitHub portfolioga yig'iladi. Yakunda o'quvchi o'z dizayni, veb-sayti va Telegram boti bo'lgan katta startap loyihasini mustaqil yaratib, taqdim etadi.",
    ],
    modules: [
      {
        name: "Dizayn & Frontend", icon: "web", tint: 0,
        desc: "Scratch'da dasturlash mantiqidan Figma UI/UX dizayn, HTML/CSS (Pixel Perfect) va JavaScript DOM'ga.",
        stages: [
          { title: "Scratch mantiq", months: "1-oy" },
          { title: "Figma + Framer", months: "2-oy" },
          { title: "HTML/CSS + JS", months: "3–6-oy" },
        ],
      },
      {
        name: "Python & Ma'lumotlar", icon: "database", tint: 1,
        desc: "Python OOP, SQLite ma'lumotlar bazasi (CRUD), API va JSON orqali tashqi dunyo bilan bog'lanish.",
        stages: [
          { title: "Python → OOP", months: "7–10-oy" },
          { title: "SQLite baza", months: "11-oy" },
          { title: "API & JSON", months: "12-oy" },
        ],
      },
      {
        name: "Bot, Algoritm & Launch", icon: "rocket_launch", tint: 2,
        desc: "aiogram botlar (FSM), algoritmlash (Big O, Stack/Queue) va VPS'ga joylanadigan final loyiha + Demo Day.",
        stages: [
          { title: "aiogram bot + FSM", months: "13–14-oy" },
          { title: "Algoritmlash", months: "15–16-oy" },
          { title: "Final + Demo Day", months: "17–18-oy" },
        ],
      },
    ],
  },
];

export default function RoadmapPage() {
  const [subject, setSubject] = useState<Subject>("ROBOTEXNIKA");
  const [age, setAge] = useState<Age>("9-11");
  const rm = ROADMAPS.find((r) => r.subject === subject && r.age === age) ?? ROADMAPS[0];

  return (
    <Shell>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>Yo'l xaritasi</h1>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            Yo'nalish va yosh toifasi bo'yicha to'liq o'quv yo'li — modullar va bosqichlar
          </p>
        </div>

        {/* Yo'nalish */}
        <div className="cur-seg" style={{ marginBottom: 16 }}>
          {(["ROBOTEXNIKA", "DASTURLASH"] as Subject[]).map((s) => (
            <button key={s} className={subject === s ? "active" : ""} onClick={() => setSubject(s)}>
              {s === "ROBOTEXNIKA" ? "Robototexnika" : "Dasturlash"}
            </button>
          ))}
        </div>

        {/* Yosh toifasi + davomiylik */}
        <div className="cur-filters" style={{ alignItems: "center", marginBottom: 22 }}>
          <div className="cur-filter-group">
            <span className="cur-filter-label">Yosh toifasi</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["9-11", "12-15"] as Age[]).map((a) => (
                <button key={a} className={`cur-chip ${age === a ? "active" : ""}`} onClick={() => setAge(a)}>
                  {a} yosh
                </button>
              ))}
            </div>
          </div>
          <div className="rm-duration">
            <span className="material-symbols-outlined">calendar_month</span>
            {rm.months} oylik dastur
          </div>
        </div>

        {/* Kirish matni */}
        <div className="rm-intro">
          {rm.intro.map((p, i) => <p key={i}>{p}</p>)}
        </div>

        {/* Modullar */}
        <div className="rm-modules">
          {rm.modules.map((m, mi) => {
            const t = TINTS[m.tint];
            return (
              <section
                key={mi}
                className="rm-module"
                style={{ background: t.soft, ["--rm-line" as string]: t.line }}
              >
                <div className="rm-mod-head">
                  <span className="rm-mod-icon" style={{ background: t.line }}>
                    <span className="material-symbols-outlined">{m.icon}</span>
                  </span>
                  <div>
                    <h2 className="rm-mod-name">{m.name}</h2>
                    <p className="rm-mod-desc">{m.desc}</p>
                  </div>
                </div>

                <div className="rm-stages">
                  {m.stages.map((s, si) => (
                    <div className="rm-stage-wrap" key={si}>
                      <div className="rm-stage">
                        <span className="rm-stage-step">{si + 1}-bosqich</span>
                        <span className="rm-stage-title">{s.title}</span>
                        <span className="rm-stage-months">
                          <span className="material-symbols-outlined">schedule</span>
                          {s.months}
                        </span>
                      </div>
                      {si < 2 && <span className="rm-arrow material-symbols-outlined">arrow_forward</span>}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
