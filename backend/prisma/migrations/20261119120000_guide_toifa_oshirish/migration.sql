-- Yo'riqnoma: toifa oshirish bo'limlari.
-- Faqat qo'shadi; shu id yoki nomli bo'lim allaqachon bo'lsa — o'tkazib yuboradi.

INSERT INTO "GuideSection" ("id", "order", "title", "body", "icon", "createdAt", "updatedAt")
SELECT $g$guide_toifa_umumiy$g$, COALESCE((SELECT MAX("order") FROM "GuideSection"), -1) + 1, $g$Toifa oshirish — umumiy tartib$g$, $g$Bu bo'limda toifa oshirish tizimi qanday ishlashi va ariza qanday topshirilishi tushuntirilgan. Har bir toifadan keyingisiga o'tish talablari pastdagi alohida bo'limlarda batafsil yozilgan:

- **1-toifadan 2-toifaga o'tish (Ustoz)**
- **2-toifadan 3-toifaga o'tish (Katta ustoz)**
- **3-toifadan 4-toifaga o'tish (Yetakchi ustoz)**

---

## Toifalar

1. **1-toifa — Kichik ustoz**
2. **2-toifa — Ustoz**
3. **3-toifa — Katta ustoz**
4. **4-toifa — Yetakchi ustoz** (eng yuqori toifa)

Toifa oshgan sari ko'proq guruh olish mumkin:

- 1-toifa: 2 tagacha 3 kunlik guruh va 1 ta 1 kunlik guruh
- 2-toifa: 4 tagacha 3 kunlik guruh va 1 ta 1 kunlik guruh
- 3-toifa: 6 tagacha 3 kunlik guruh va 2 ta 1 kunlik guruh
- 4-toifa: 5 tagacha 3 kunlik guruh

Toifa faqat bittadan oshiriladi: 1 → 2, 2 → 3, 3 → 4. Hozirgi toifangiz va qaysi toifaga ariza berishingiz platformada avtomatik aniqlanadi.

---

## Toifa oshirish uchun nima kerak

Har bir o'tishda **uchta shart** bor:

1. **Minimal ish tajribasi** — hozirgi toifada ma'lum muddat ishlagan bo'lish.
2. **Avtomatik ko'rsatkichlar** — uy vazifa bajarilishi, davomat, ketgan o'quvchilar va kechikish talab darajasida bo'lishi. Bular statistikadan o'zi olinadi.
3. **Vazifalar** — metodik ishlar, kasbiy rivojlanish va sertifikatlar. Bularni o'zingiz bajarasiz va arizada belgilaysiz.

### Avtomatik ko'rsatkichlar qanday hisoblanadi

- **Uy vazifa bajarilishi**, **Davomat** va **Ketgan o'quvchilar** — oxirgi 3 oyning o'rtachasi.
- **Kechikish** — faqat oxirgi oy.
- Oyning 20-sanasigacha joriy oy hisobga kirmaydi. Shuning uchun ariza oynasida (1–10 sanalar) oxirgi 3 ta to'liq oy olinadi.
- "Uy vazifani kech tekshirish" ko'rsatkichi toifa talabiga kirmaydi.

Ko'rsatkichlaringizni istalgan vaqtda **"Toifa oshirish"** sahifasida ko'rishingiz mumkin. Har birining yonida **✓** (bajarilgan) yoki **✗** (bajarilmagan) belgisi va talab chegarasi turadi. Ariza oynasini kutmasdan oldindan tekshirib boring.

**Ko'rsatkichlardan biri bajarilmagan bo'lsa:** avval **O'quv bo'limi** bilan gaplashing. Ular ruxsat bersa, ariza sahifasida **"O'quv bo'limi bilan maslahatlashilgan"** belgisini qo'ying, shunda ariza topshira olasiz. Admin bajarilmagan ko'rsatkichlarni va shu belgini arizada ko'radi.

---

## Ariza qachon qabul qilinadi

> Ariza **faqat har oyning 1–10 sanalari** orasida qabul qilinadi. Boshqa kunlarda "Ariza topshirish" tugmasi bosilmaydi.

Bir vaqtda faqat **bitta** ariza ko'rib chiqiladi. Oldingi arizangizga javob kelmaguncha yangisini topshira olmaysiz.

---

## Ariza topshirish — bosqichma-bosqich

1. **Dalillarni tayyorlang.** Har bir vazifa bo'yicha taqdimotlar, hisobotlar, fotolar va boshqa dalillarni Google Drive yoki boshqa joyga yuklab, havolalarini bir joyga yozib qo'ying.
2. **Sertifikatlaringizni yuklang.** Chap menyudagi **Sozlamalar** bo'limiga kirib, sertifikat fayllarini yuklang. Ariza sahifasida faqat shu yerga yuklangan sertifikatlarni tanlash mumkin.
3. Har oyning **1–10 sanalari** orasida chap menyudan **"Toifa oshirish"** bo'limini oching.
4. Sahifa tepasida hozirgi va keyingi toifangiz ko'rinadi, masalan: **"1-toifa → 2-toifa (Ustoz)"**.
5. **Avtomatik ko'rsatkichlar**ni tekshiring. Hammasi ✓ bo'lishi kerak. ✗ bo'lsa, yuqoridagi tushuntirishni o'qing.
6. **"Bajarilishi kerak bo'lgan vazifalar"** ro'yxatidagi barcha bandlarni belgilang. Hammasi belgilanmasa, ariza yuborilmaydi.
7. Ariza bilan birga yubormoqchi bo'lgan **sertifikatlarni tanlang**.
8. **"Qo'shimcha izoh / havolalar"** maydoniga 1-qadamda tayyorlagan havolalaringizni yozing. Har bir havola qaysi vazifaga tegishli ekanini ko'rsating.
9. **"Ariza topshirish"** tugmasini bosing.

Tugma bosilmasa, uning ostidagi qizil ramkada sababi yoziladi: ariza oynasi yopiq, ko'rsatkichlar bajarilmagan yoki hamma vazifalar belgilanmagan.

> Belgilagan har bir vazifangizni isbotlay olishingiz kerak. Bajarilmagan vazifani belgilamang.

---

## Ariza holatlari

Topshirgan arizalaringiz o'sha sahifadagi **"Arizalar tarixi"** qismida ko'rinadi:

- **Ko'rib chiqilmoqda** — ariza qabul qilindi, admin ko'rib chiqmoqda
- **Suhbatga taklif qilindi** — siz bilan suhbat o'tkaziladi, siz bilan bog'lanishadi
- **Tasdiqlandi** — ariza qabul qilindi, toifangiz oshiriladi
- **Rad etildi** — sababi admin izohida yoziladi

Ariza rad etilsa, kamchiliklarni tuzatib keyingi oyning 1–10 sanalarida qayta topshirishingiz mumkin.

---

## Tez-tez uchraydigan muammolar

**"Statistikada ismingiz topilmadi" chiqyapti.**
Platformadagi ismingiz statistika jadvalidagi yozuvga mos kelmayapti. Admin bilan bog'laning: u accountingizni statistikadagi ismingizga biriktirib qo'yadi.

**Ko'rsatkichlarim noto'g'ri ko'rinyapti.**
Ular statistika jadvalidan olinadi. Raqamlar xato bo'lsa, O'quv bo'limiga murojaat qiling.

**Toifam noto'g'ri ko'rsatilgan.**
Toifa o'qituvchilar ro'yxatidan olinadi. Admin bilan bog'laning.

**"Sizda hali ko'rib chiqilayotgan ariza mavjud" chiqyapti.**
Oldingi arizangizga javob kelishini kuting.

**"Siz allaqachon eng yuqori toifadasiz" chiqyapti.**
Siz 4-toifadasiz (Yetakchi ustoz), ariza topshirish shart emas.$g$, $g$military_tech$g$, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "GuideSection" WHERE "id" = $g$guide_toifa_umumiy$g$ OR "title" = $g$Toifa oshirish — umumiy tartib$g$);

INSERT INTO "GuideSection" ("id", "order", "title", "body", "icon", "createdAt", "updatedAt")
SELECT $g$guide_toifa_1_2$g$, COALESCE((SELECT MAX("order") FROM "GuideSection"), -1) + 1, $g$1-toifadan 2-toifaga o'tish (Ustoz)$g$, $g$**Kichik ustoz → Ustoz.** Bu o'tishda o'z darslaringizni sifatli o'tishdan tashqari, metodikaga hissa qo'shishingiz va boshqa ustozlar bilan tajriba almashishingiz kerak.

Ariza topshirish tartibi **"Toifa oshirish — umumiy tartib"** bo'limida yozilgan.

---

## 1. Minimal tajriba

"Kichik ustoz" sifatida **kamida 4 oy** muvaffaqiyatli ish tajribasi, **kamida 2 ta guruh** bilan.

---

## 2. Avtomatik ko'rsatkichlar

- **Uy vazifa bajarilishi** — kamida **70%** (oxirgi 3 oy o'rtachasi)
- **Davomat** — kamida **80%** (oxirgi 3 oy o'rtachasi)
- **Ketgan o'quvchilar** — ko'pi bilan **10%** (oxirgi 3 oy o'rtachasi)
- **Kechikish** — ko'pi bilan **10 daqiqa** (oxirgi oy)

Bu raqamlar statistikadan avtomatik olinadi. Ularni "Toifa oshirish" sahifasida oldindan kuzatib boring.

---

## 3. Bajarilishi kerak bo'lgan vazifalar

Arizada quyidagi **4 ta** vazifaning hammasi bajarilgan deb belgilanishi shart.

### 3.1. 5 ta yangi dars taqdimoti

**Talab:** yangi mavzular bo'yicha 5 ta to'liq dars taqdimotini mustaqil yaratish va metodistdan tasdiqlatish.

**Nima qilish kerak:**
- Dasturda hali taqdimoti bo'lmagan yoki yangi mavzularni tanlang.
- Har biriga to'liq dars taqdimoti tayyorlang.
- Taqdimotlarni metodistga ko'rsatib, tasdiqlating.
- 5 ta taqdimotning havolasini arizadagi izohga yozing.

### 3.2. Dars rejasi bo'yicha 3 ta taklif

**Talab:** mavjud dars rejasini takomillashtirish bo'yicha kamida 3 ta asoslangan yozma taklif kiritish.

**Nima qilish kerak:**
- Darslarda sezgan kamchiliklaringizni yozib boring: o'quvchilarga nima qiyin bo'ldi, nima vaqtga sig'madi.
- Har bir taklifni yozma shaklda tayyorlang: qaysi dars, nimani o'zgartirish kerak va nima uchun.
- Takliflarni metodistga yoki o'quv bo'limiga yuboring.
- Takliflar hujjatining havolasini izohga yozing.

### 3.3. 2 ta master-klass

**Talab:** boshqa ustozlarga 2 ta mavzuda (pedagogik, texnik yoki shaxsiy rivojlanish) master-klass o'tib berish. Dars taqdimoti, kuzatuvchilar xulosalari va foto hisobot bilan.

**Nima qilish kerak:**
- 2 ta mavzu tanlang va har biriga taqdimot tayyorlang.
- O'quv bo'limi bilan kelishib, ustozlar uchun master-klass o'tkazing.
- Har bir master-klassdan **taqdimot**, **kuzatuvchilarning yozma xulosalari** va **foto hisobot** to'plang.
- Hammasining havolasini izohga yozing.

### 3.4. Yo'nalish bo'yicha sertifikat

**Talab:** yo'nalish bo'yicha biror kursni muvaffaqiyatli tugatganlik sertifikati (Arduino/Python).

**Nima qilish kerak:**
- Arduino yoki Python bo'yicha kursni tugatib, sertifikat oling.
- Sertifikatni **Sozlamalar** bo'limiga yuklang.
- Arizada shu sertifikatni tanlang.

---

## Ariza oldidan tekshiruv

- ☐ Kichik ustoz sifatida 4 oydan ko'p ishladim, kamida 2 ta guruhim bor
- ☐ "Toifa oshirish" sahifasida barcha ko'rsatkichlar ✓
- ☐ 5 ta taqdimot tayyor va metodist tasdiqlagan
- ☐ 3 ta yozma taklif yuborilgan
- ☐ 2 ta master-klass o'tkazilgan, hisobotlari tayyor
- ☐ Sertifikat Sozlamalar'ga yuklangan
- ☐ Barcha havolalar bir joyga yozilgan
- ☐ Bugun oyning 1–10 sanalari orasida$g$, $g$looks_two$g$, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "GuideSection" WHERE "id" = $g$guide_toifa_1_2$g$ OR "title" = $g$1-toifadan 2-toifaga o'tish (Ustoz)$g$);

INSERT INTO "GuideSection" ("id", "order", "title", "body", "icon", "createdAt", "updatedAt")
SELECT $g$guide_toifa_2_3$g$, COALESCE((SELECT MAX("order") FROM "GuideSection"), -1) + 1, $g$2-toifadan 3-toifaga o'tish (Katta ustoz)$g$, $g$**Ustoz → Katta ustoz.** Bu o'tishda siz yangi o'quv materiallari yaratasiz, yangi ustozlarga mentorlik qilasiz va malakangizni tashqi sertifikatlar bilan tasdiqlaysiz.

Ariza topshirish tartibi **"Toifa oshirish — umumiy tartib"** bo'limida yozilgan.

---

## 1. Minimal tajriba

"Ustoz" sifatida **kamida 1 o'quv yili** (taxminan 12 oy) muvaffaqiyatli ish tajribasi.

---

## 2. Avtomatik ko'rsatkichlar

- **Uy vazifa bajarilishi** — kamida **80%** (oxirgi 3 oy o'rtachasi)
- **Davomat** — kamida **85%** (oxirgi 3 oy o'rtachasi)
- **Ketgan o'quvchilar** — ko'pi bilan **8%** (oxirgi 3 oy o'rtachasi)
- **Kechikish** — ko'pi bilan **10 daqiqa** (oxirgi oy)

Bu raqamlar statistikadan avtomatik olinadi. Ularni "Toifa oshirish" sahifasida oldindan kuzatib boring.

---

## 3. Bajarilishi kerak bo'lgan vazifalar

Arizada quyidagi **6 ta** vazifaning hammasi bajarilgan deb belgilanishi shart.

### 3.1. 10 ta yangi dars taqdimoti

**Talab:** yangi mavzular bo'yicha 10 ta to'liq dars taqdimotini mustaqil yaratish va metodistdan tasdiqlatish.

**Nima qilish kerak:**
- Yangi mavzularni tanlang va har biriga to'liq dars taqdimoti tayyorlang.
- Taqdimotlarni metodistga ko'rsatib, tasdiqlating.
- 10 ta taqdimotning havolasini arizadagi izohga yozing.

### 3.2. Yangi mini-loyiha

**Talab:** yangi mini-loyiha ishlab chiqish: Arduino yoki EV3 asosida, kamida 3 darsga mo'ljallangan, to'liq dars rejalari va taqdimoti bilan.

**Nima qilish kerak:**
- Arduino yoki EV3 asosida loyiha g'oyasini tanlang.
- Uni kamida 3 ta darsga bo'ling.
- Har bir dars uchun **dars rejasi** va **taqdimot** tayyorlang.
- Loyihani o'zingiz yig'ib, ishlashini tekshiring.
- Barcha materiallarning havolasini izohga yozing.

### 3.3. 2 nafar Amaliyotchi ustozga mentorlik

**Talab:** 2 nafar "Amaliyotchi ustoz"ni "Kichik ustoz" bo'lib tasdiqlanishigacha mentorlik qilish.

**Nima qilish kerak:**
- O'quv bo'limi bilan kelishib, 2 nafar Amaliyotchi ustozni mentorlikka oling.
- Ularning darslarini kuzating va maslahat bering.
- Ikkalasi ham "Kichik ustoz" bo'lib tasdiqlanguncha yordam bering.
- Arizadagi izohda ularning ismlarini yozing.

### 3.4. 1 nafar Kichik ustozga mentorlik

**Talab:** 1 nafar Kichik ustozga mentorlik qilish va uning "Ustoz" toifasiga o'tishiga yordam berish.

**Nima qilish kerak:**
- Bitta Kichik ustozni mentorlikka oling.
- Unga 2-toifa talablarini bajarishda yordam bering: taqdimotlar, master-klasslar, ko'rsatkichlar.
- U "Ustoz" toifasiga o'tganidan keyin bu vazifa bajarilgan hisoblanadi.
- Arizadagi izohda uning ismini yozing.

### 3.5. Tashqi kurs yoki sertifikat

**Talab:** o'z sohasi bo'yicha tashqi kursda o'qish yoki sertifikat olish (masalan, "Arduino C++", "App Inventor", "3D modellashtirish").

**Nima qilish kerak:**
- O'z yo'nalishingiz bo'yicha tashqi kursni tugating.
- Sertifikatni **Sozlamalar** bo'limiga yuklang va arizada tanlang.

### 3.6. Ingliz tili B1

**Talab:** ingliz tili bo'yicha B1 sertifikati.

**Nima qilish kerak:**
- B1 darajani tasdiqlovchi sertifikat oling.
- Uni **Sozlamalar** bo'limiga yuklang va arizada tanlang.

---

## Ariza oldidan tekshiruv

- ☐ Ustoz sifatida kamida 1 o'quv yili ishladim
- ☐ "Toifa oshirish" sahifasida barcha ko'rsatkichlar ✓
- ☐ 10 ta taqdimot tayyor va metodist tasdiqlagan
- ☐ Mini-loyiha (kamida 3 dars) rejalari va taqdimotlari bilan tayyor
- ☐ 2 nafar Amaliyotchi ustoz Kichik ustoz bo'lib tasdiqlangan
- ☐ Mentorlikdagi Kichik ustoz Ustoz toifasiga o'tgan
- ☐ Tashqi kurs sertifikati va B1 sertifikati Sozlamalar'ga yuklangan
- ☐ Barcha havolalar va ismlar bir joyga yozilgan
- ☐ Bugun oyning 1–10 sanalari orasida$g$, $g$looks_3$g$, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "GuideSection" WHERE "id" = $g$guide_toifa_2_3$g$ OR "title" = $g$2-toifadan 3-toifaga o'tish (Katta ustoz)$g$);

INSERT INTO "GuideSection" ("id", "order", "title", "body", "icon", "createdAt", "updatedAt")
SELECT $g$guide_toifa_3_4$g$, COALESCE((SELECT MAX("order") FROM "GuideSection"), -1) + 1, $g$3-toifadan 4-toifaga o'tish (Yetakchi ustoz)$g$, $g$**Katta ustoz → Yetakchi ustoz.** Bu eng yuqori toifa. Unga o'tishda siz o'quv dasturlariga katta hissa qo'shasiz, ustozlar jamoasini boshqarasiz va Robbit Akademiyasini tashqarida taqdim etasiz.

Ariza topshirish tartibi **"Toifa oshirish — umumiy tartib"** bo'limida yozilgan.

---

## 1. Minimal tajriba

"Katta ustoz" sifatida **kamida 1,5 o'quv yili** (18 oy) muvaffaqiyatli ish tajribasi va **sezilarli metodik hissa**.

---

## 2. Avtomatik ko'rsatkichlar

- **Uy vazifa bajarilishi** — kamida **85%** (oxirgi 3 oy o'rtachasi)
- **Davomat** — kamida **85%** (oxirgi 3 oy o'rtachasi)
- **Ketgan o'quvchilar** — ko'pi bilan **6%** (oxirgi 3 oy o'rtachasi)
- **Kechikish** — ko'pi bilan **10 daqiqa** (oxirgi oy)

Bu raqamlar statistikadan avtomatik olinadi. Ularni "Toifa oshirish" sahifasida oldindan kuzatib boring.

---

## 3. Bajarilishi kerak bo'lgan vazifalar

Arizada quyidagi **5 ta** vazifaning hammasi bajarilgan deb belgilanishi shart.

### 3.1. 15 ta taqdimot YOKI butun modul

**Talab:** mavzular bo'yicha 15 ta to'liq dars taqdimotini YOKI 1 ta o'quv moduli dasturi va dars taqdimotlarini to'liq mustaqil yaratish va metodistdan tasdiqlatish.

**Nima qilish kerak (ikki yo'ldan birini tanlang):**
- **1-yo'l:** 15 ta to'liq dars taqdimotini tayyorlab, metodistdan tasdiqlating.
- **2-yo'l:** bitta o'quv modulining dasturini va uning barcha dars taqdimotlarini noldan tayyorlab, metodistdan tasdiqlating.
- Barcha materiallarning havolasini arizadagi izohga yozing.

### 3.2. Metodik guruh

**Talab:** muayyan texnologiya, modul yoki pedagogika bo'yicha metodik guruh (working group) tuzish va boshqarish (masalan IoT, Scratch, 3D).

**Nima qilish kerak:**
- Yo'nalish tanlang va o'quv bo'limi bilan kelishing.
- Ustozlardan metodik guruh tuzing.
- Guruh uchun maqsad va reja belgilab, uchrashuvlarni muntazam o'tkazing.
- Guruh natijalarini (yangi materiallar, takliflar, hisobotlar) to'plab, havolasini izohga yozing.

### 3.3. Maqola yoki ma'ruza

**Talab:** ta'lim sohasidagi nashrlarda maqola chop etish yoki konferensiyalarda ma'ruza qilish (Robbit Akademiyasi nomidan).

**Nima qilish kerak:**
- Ta'lim sohasidagi nashrda maqola chop eting yoki konferensiyada ma'ruza qiling.
- Maqola yoki ma'ruzada Robbit Akademiyasi nomidan chiqqaningiz ko'rsatilsin.
- Maqola havolasini yoki ma'ruza dalilini (dastur, foto, video) izohga yozing.

### 3.4. Ingliz tili B2

**Talab:** ingliz tili bo'yicha B2 sertifikati.

**Nima qilish kerak:**
- B2 darajani tasdiqlovchi sertifikat oling.
- Uni **Sozlamalar** bo'limiga yuklang va arizada tanlang.

### 3.5. O'quvchilarning musobaqadagi sovrinli o'rinlari

**Talab:** o'quvchilarning musobaqalardagi sovrinli o'rinlari (1, 2, 3): kamida 2 ta mavsumiy musobaqa va 1 ta respublika darajasidagi musobaqa.

**Nima qilish kerak:**
- O'quvchilaringizni musobaqalarga tayyorlang.
- Kamida **2 ta mavsumiy** va **1 ta respublika** musobaqasida o'quvchilaringiz 1, 2 yoki 3-o'rinni olishi kerak.
- Diplom yoki natijalar ro'yxatini to'plang va havolasini izohga yozing. O'quvchi ismlari va musobaqa nomlarini ko'rsating.

---

## Ariza oldidan tekshiruv

- ☐ Katta ustoz sifatida kamida 1,5 o'quv yili (18 oy) ishladim
- ☐ "Toifa oshirish" sahifasida barcha ko'rsatkichlar ✓
- ☐ 15 ta taqdimot yoki to'liq modul tayyor va metodist tasdiqlagan
- ☐ Metodik guruh tuzilgan va ishlayapti, natijalari bor
- ☐ Maqola chop etilgan yoki ma'ruza qilingan
- ☐ B2 sertifikati Sozlamalar'ga yuklangan
- ☐ 2 ta mavsumiy va 1 ta respublika musobaqasida sovrinli o'rinlar bor
- ☐ Barcha havolalar bir joyga yozilgan
- ☐ Bugun oyning 1–10 sanalari orasida$g$, $g$looks_4$g$, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "GuideSection" WHERE "id" = $g$guide_toifa_3_4$g$ OR "title" = $g$3-toifadan 4-toifaga o'tish (Yetakchi ustoz)$g$);
