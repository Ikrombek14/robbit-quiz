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
