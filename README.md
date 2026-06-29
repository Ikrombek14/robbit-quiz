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

## Deploy

Master'ga push → GitHub Actions **`Deploy → robbit-quiz server`** avtomatik build qilib
serverga (`root@157.173.114.153:/root/apps/robbit-quiz`) yuboradi, migratsiya qiladi va
PM2'ni qayta ishga tushiradi. Tekshirish:
```bash
curl https://robbitquiz.uz/api/health                 # {"ok":true,...}
```

### ✅ Hal qilingan: P1000 (deploy 2026-06-28..29 da yiqilardi)
**Sabab:** server PostgreSQL klasteri **5432 da emas, 5435-portda** turibdi (5432 ni boshqa
narsa egallagan va auth'ni rad etardi → `P1000: Authentication failed`). Barcha admin
buyruqlari (`ALTER USER`, trust, reload) to'g'ri 5435 klasteriga tegardi, lekin Prisma
`localhost:5432` ga ulanardi.

**Yechim** (`.github/workflows/deploy.yml`, SSH bloki):
- `SHOW port` bilan klasterning haqiqiy porti aniqlanadi va `.env` dagi `DATABASE_URL`
  o'sha klaster **unix socket**'iga yo'naltiriladi: `...?host=/var/run/postgresql` (port-agnostik).
- `pg_hba.conf`'da `local/host robbit_quiz robbit ... trust` + `pg_reload_conf()` bilan
  faollashtiriladi — ulanish parolga bog'liq emas.
- `migrate resolve --applied` (P3005 baseline) **faqat** `Teacher` jadvali allaqachon mavjud
  bo'lsa bajariladi; bo'sh bazada `migrate deploy` hammasini noldan quradi.

### Secrets
Workflow quyidagi GitHub Secrets'ga tayanadi: `SERVER_HOST`, `SERVER_USER`, `SERVER_PASS`,
`DB_PASS`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`, `ADMIN_PASSWORD`.
Adminlar (`ADMIN_EMAILS`) deploy.yml ichida: `teamlead.robbit@gmail.com,ilkhomjon2001@gmail.com`.
