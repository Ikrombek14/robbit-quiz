# Robbit Akademiyasi — Quiz platformasi

Quizizz/Wayground uslubidagi jonli quiz platformasi. O'qituvchi PDF yuklaydi → AI savollar yaratadi → o'quvchilar 6 xonalik kod orqali jonli testga qo'shiladi.

## Texnologiyalar

- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + Socket.io + TypeScript
- **DB:** SQLite (dev) / PostgreSQL (prod) + Prisma
- **AI:** Claude API (`claude-opus-4-8`) — PDF'dan savol generatsiyasi
- **Auth:** Email + parol (JWT)

## Ishga tushirish

### Backend

```bash
cd backend
npm install
cp .env.example .env          # ANTHROPIC_API_KEY ni to'ldiring
npx prisma migrate dev --name init
npm run dev                   # http://localhost:4000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

## Rivojlanish bosqichlari

1. ✅ Skeleton (backend + frontend)
2. ⏳ O'qituvchi auth (JWT)
3. ⏳ PDF → AI savol generatsiyasi
4. ⏳ Quiz CRUD
5. ⏳ Jonli o'yin (PIN, Socket.io, leaderboard)

---

## 🚨 HAL QILINISHI KERAK: Deploy yiqilmoqda (server tomoni)

> **Serverni boshqaruvchi sherik uchun** (GitHub Secrets + server SSH huquqi sizda).
> Agar buni Claude bilan o'qiyotgan bo'lsangiz — pastdagi "Claude uchun" qadamlarni bajaring.

### Belgilar (aniqlangan holat)
- GitHub Actions **`Deploy → robbit-quiz server`** workflow'i oxirgi bosqich
  **`Serverga yuborish va o'rnatish`** (SSH) da **exit code 1** bilan yiqilyapti.
- **`2026-06-28 21:18` dan beri HAR BIR deploy muvaffaqiyatsiz** (oxirgi muvaffaqiyatli shu vaqtda edi).
- CI'ning frontend/backend **build bosqichlari muvaffaqiyatli** — muammo kodda emas, **server tomonidagi o'rnatishda**.
- Oqibat: production (`robbitquiz.uz`) eski kodda ishlayapti. Tekshirish:
  ```bash
  curl -X POST https://robbitquiz.uz/api/import/wayground -d '{}' -H 'Content-Type: application/json'
  # Hozir: 404 (route yo'q = eski kod).   To'g'ri deploy'dan keyin: 401 (auth kerak = yangi kod).
  ```

### Eng ehtimoliy sabab
`.github/workflows/deploy.yml` ichidagi SSH skriptida `set -e` bor va yagona **himoyalanmagan**
(`|| true` siz) buyruq — **`npx prisma migrate deploy`**. SQLite → PostgreSQL ko'chirishdan
keyin (`20260628104152_init` yangi migratsiya, eskilar `migrations_sqlite_bak/` da) server
DB'sida **migratsiya tarixi mos kelmaydi** → quyidagilardan biri:
- `P3005` — baza bo'sh emas (jadvallar bor, lekin `_prisma_migrations` tarixi yo'q),
- `P3009` — yarim qolgan / failed migratsiya yozuvi,
- `relation already exists` — jadval allaqachon mavjud.

### Claude uchun: tashxis va tuzatish qadamlari
Avval o'qib chiq: `.github/workflows/deploy.yml` (SSH bloki, ~75–119-qatorlar),
`server-setup.sh`, `PRODUCTION-CHECKLIST.md`, `backend/prisma/schema.prisma`.

1. **Aniq xatoni ko'r** — GitHub → Actions → oxirgi qizil run → `Serverga yuborish va o'rnatish`
   bosqichining to'liq logini och (qaysi buyruqda yiqilganini ko'rsatadi).

2. **Serverda holatni tekshir** (SSH: `root@157.173.114.153`, ilova `/root/apps/robbit-quiz`):
   ```bash
   cd /root/apps/robbit-quiz
   npx prisma migrate status
   sudo -u postgres psql robbit_quiz -c '\dt'                       # jadvallar bormi?
   sudo -u postgres psql robbit_quiz -c 'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations";'
   ```

3. **Holatga qarab tuzat:**
   - **P3005** (jadvallar bor, tarix yo'q) → migratsiyani "bajarilgan" deb belgila (baseline):
     ```bash
     npx prisma migrate resolve --applied 20260628104152_init
     npx prisma migrate deploy
     ```
   - **P3009 / failed yozuv** → muammoli yozuvni hal qil:
     ```bash
     npx prisma migrate resolve --rolled-back 20260628104152_init   # yoki --applied, holatga qarab
     npx prisma migrate deploy
     ```
   - **Tezkor (faqat dev/ma'lumot muhim emas bo'lsa)** — bazani qaytadan qurish:
     ```bash
     npx prisma migrate reset --force        # ⚠️ HAMMA ma'lumotni o'chiradi
     ```

4. **Qo'lda deploy'ni sina** (server holati tuzatilgach, push'ni kutmasdan):
   `pm2 restart robbit-quiz` va `pm2 logs robbit-quiz --lines 30`.

5. **deploy.yml'ni mustahkamlash** (kelajakda takrorlanmasligi uchun, ixtiyoriy):
   `prisma migrate deploy`'ni try/fallback bilan o'rab, P3005/P3009'da avtomatik
   `migrate resolve` qilib, keyin qayta `migrate deploy` qilsin.

6. **Tekshirish:** yuqoridagi `curl` `401` qaytarsa — yangi kod (import funksiyasi) jonli.
   Brauzerda `robbitquiz.uz` → quiz muharriri → SAHIFALAR → 🎮 Quiz import ishlashini sina.

### Eslatma: secrets
Workflow quyidagi GitHub Secrets'ga tayanadi (serverni boshqaruvchida bo'lishi kerak):
`SERVER_HOST`, `SERVER_USER`, `SERVER_PASS`, `DB_PASS`, `JWT_SECRET`,
`ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `ADMIN_PASSWORD`. Bittasi yo'q/noto'g'ri bo'lsa
ham SSH bosqichi yiqilishi mumkin — logda tekshiring.
