# Production-tayyorlik checklist — Robbit Quiz

> Maqsad: 100 ustoz, ~2000 o'quvchi, bir vaqtda 15+ jonli host, 700+ PDF slayd — bexato, sinxron, himoyalangan.
> `[ ]` = qilinmagan · `[x]` = bajarildi. Tartib: 🔴 blokerlardan boshlang.

---

## 🔴 BLOKERLAR (masshtabga chiqishdan oldin SHART)

### DB — PostgreSQL'ga ko'chirish
- [x] `schema.prisma` provider'ni `postgresql` ga o'zgartirish
- [x] Postgres serverini sozlash (lokal: parol=1899, baza=robbit_quiz) + `DATABASE_URL`
- [x] Migratsiyalarni qayta yaratish (`20260628104152_init`) — eski SQLite migratsiyalar `migrations_sqlite_bak/` ga ko'chirildi
- [ ] **Prod serverda** Postgres o'rnatish + `DATABASE_URL` `.env.production` ga qo'yish
- [ ] Connection pool sozlash (`?connection_limit=10`)
- **Nega:** SQLite bir vaqtda 1 yozuv → 2000 user'da "database is locked" va qotish.

### HTTPS / TLS
- [ ] Domen ulash (masalan `quiz.robbit.uz`)
- [ ] Reverse proxy (nginx yoki Caddy) o'rnatish
- [ ] TLS sertifikat (Let's Encrypt / certbot, avtomatik yangilanish)
- [ ] HTTP → HTTPS redirect
- [ ] `CLIENT_URL` ni `https://…` ga yangilash
- **Nega:** Hozir oddiy HTTP — parol/JWT ochiq uzatilyapti. Himoya talabiga zid.

### Jonli o'yin barqarorligi (SPOF)
- [ ] PM2 `max_memory_restart` ni 1–2GB ga oshirish
- [ ] Server RAM yetarliligini tekshirish (2000 socket uchun)
- [ ] O'yin holatini Redis'ga ko'chirish **yoki** davriy DB snapshot (restart'da yo'qolmasin)
- [ ] Socket.io reconnection sozlamalari (host/o'quvchi uzilsa qaytsin) — qisman bor, tekshirish
- [ ] Graceful shutdown (deploy paytida jonli o'yinlarni ogohlantirish)
- **Nega:** 1 jarayon qotsa/restart bo'lsa — 15 ta jonli dars yo'qoladi.

### Fayl saqlash (700+ PDF) + himoya
- [x] `/uploads` rate-limited (300 req/min) — ommaviy yuklab olishdan himoya
- [ ] `/uploads` to'liq auth — **S3/MinIO ga o'tgandan keyin** signed URL bilan hal qilinadi
- [ ] Object storage (S3/MinIO) ga ko'chirish (lokal disk o'rniga)
- [ ] **Zaxira (backup)** — DB + fayllar (kunlik avtomatik)
- [ ] Yuklash hajmi/soni cheklovi (disk to'lib qolmasin)
- **Nega:** Hozir rasmlar autentifikatsiyasiz ochiq, zaxira yo'q — server o'lsa 700 PDF yo'qoladi.

### Yuk testi (load test)
- [ ] k6 yoki artillery bilan stsenariy: 15 host + 2000 socket + javob oqimi
- [ ] CPU/RAM/latency o'lchash, "qotish" nuqtasini topish
- [ ] Topilgan muammolarni tuzatish
- **Nega:** Test qilmasdan "bexato ishlaydi" deb bo'lmaydi.

---

## 🟠 MUHIM (tez orada)

### Xavfsizlik
- [x] `helmet` (xavfsizlik header'lari — HSTS, nosniff, X-Frame SAMEORIGIN)
- [x] `express-rate-limit`: login/register (30/15min), AI (20/soat), upload (200/15min), uploads-static (300/min)
- [x] CORS: prod'da faqat `CLIENT_URL` ga cheklangan
- [x] JWT_SECRET faqat env'da ✅
- [ ] Ochiq route'larni qayta ko'rib chiqish: `/s/:id`, `/api/public/quizzes/:id` — to'liq mazmun auth'siz beriladi
- [ ] Parol minimal uzunligini oshirish (6 → 8+), kuchlilik tekshiruvi
- [ ] AI endpoint'ni faqat approved/admin ga cheklash + kunlik limit

### Ma'lumotlar bazasi
- [x] Indekslar qo'shildi: `GameRecord(teacherId,playedAt)`, `GameRecord(quizId)`, `GamePlayerRecord(gameId)`, `Quiz(teacherId)`, `Quiz(createdAt)`, `Slide(quizId,order)`
- [ ] Eski/katta `GameRecord` larni arxivlash strategiyasi (cheksiz o'smasin)
- [ ] `details`/`questionStats` JSON hajmini cheklash

### Kuzatuv (observability)
- [ ] Xato kuzatuvi (Sentry yoki shunga o'xshash) — backend + frontend
- [ ] Strukturali loglar (kim/qachon/qaysi o'yin)
- [ ] Health-check monitoring (uptime alert)
- [ ] PM2 / server resurs monitoringi

---

## 🟡 SAYQAL / KEYINGI

- [ ] Frontend code-split (700KB+ bundle + 1.3MB pdf.worker bo'linsin)
- [ ] JWT'ni httpOnly cookie'ga ko'chirish (XSS xavfi kamayadi)
- [ ] CI/CD (avtomatik test + build + deploy), zero-downtime deploy
- [ ] Test suite (hech bo'lmaganda kritik oqimlar: auth, host:create, scoring)
- [ ] Linter (eslint) + format
- [ ] O'yinga soxta o'quvchi to'ldirish (join flood) cheklovi
- [ ] Mobil/sekin internet uchun optimizatsiya (rasm o'lchami, lazy-load)

---

## ⚠️ "Ma'lumotni yuklab olib bo'lmasligi" — halol haqiqat

100% kafolat **mumkin emas** — brauzerda ko'rsatilgan har narsa (HTML/rasm) skrinshot/skrap qilinishi mumkin. Realistik **kamaytirish**:
- [ ] Uploads'ni auth + qisqa muddatli signed URL bilan yopish
- [ ] Rasmlarga suv belgisi (watermark) — ustoz/sana
- [ ] Rasmlarni kerakli o'lchamda (ortiqcha katta original bermaslik)
- [ ] O'ng-tugma/drag/clipboard cheklash (jiddiy emas, lekin to'siq)
- [ ] PDF original faylni umuman bermaslik (faqat rasterlangan rasm) — hozir shunday

> Eslatma: "hech qanaqasiga" — erishib bo'lmaydigan maqsad. Yuqoridagilar amaliy himoya darajasi.

---

## ✅ Tavsiya etilgan tartib

### Bajarildi ✅
- [x] PostgreSQL ko'chirish (lokal) + migratsiya
- [x] helmet + rate-limit + CORS (prod'da)
- [x] DB indekslari
- [x] uploads rate-limit
- [x] `host:create` — har qanday ustoz boshqasining quizini host qila oladi
- [x] `HostShare.tsx` sahifasi (`/h/:id`) — havolani ulashish

### Keyingi navbat
1. **Prod serverda PostgreSQL** — `DATABASE_URL` ni prod `.env.production` ga qo'yish, `migrate deploy`
2. **HTTPS + nginx** — domen, TLS, HTTP→HTTPS redirect
3. **Uploads backup** — DB + `/uploads` kunlik zaxira
4. **PM2 memory + o'yin barqarorligi** — `max_memory_restart`, Redis/snapshot
5. **S3/MinIO** — uploads'ni bulutga ko'chirish + signed URL
6. **Yuk testi** — k6/artillery (15 host + 2000 socket)
7. **Sentry** — frontend + backend xatoliklar kuzatuvi
8. **code-split** — 700KB+ bundle bo'linsin
