# Git yo'riqnoma — Robbit Quiz (shaxsiy)

> 2 kishilik jamoa uchun amaliy qo'llanma. Repo: `https://github.com/Ikrombek14/robbit-quiz`
> Asosiy branch: **master**

---

## 0. Eng muhim qoida
**Hech qachon mavjud loyihada qaytadan `git init` qilmang yoki fayllarni nusxalab yangi repo yaratmang.**
Ikkalangiz ham AYNAN bitta repodan ishlaysiz. Yangi kompyuterda boshlash:
```bash
git clone https://github.com/Ikrombek14/robbit-quiz.git
cd robbit-quiz
cd backend && npm install
cd ../frontend && npm install
```

---

## 1. HAR KUNI — ish boshlashdan oldin
```bash
git checkout master
git pull                 # eng so'nggi kodni olasiz
```

## 2. Yangi ish boshlaganda — alohida branch oching
```bash
git checkout master
git pull
git checkout -b feature/nima-qilyapman     # masalan: feature/oquv-reja
```
Branch nomi qisqa va tushunarli bo'lsin: `feature/...`, `fix/...`

## 3. Ishlash davomida — tez-tez commit
```bash
git add -A
git commit -m "Nima qilingani (qisqa)"
```
Kuniga bir necha marta. Katta ishni commit qilmay ushlab turmang!

## 4. Ishingizni yuborish
```bash
git pull origin master    # avval master'dagi yangiliklarni oling (konflikt bo'lsa hal qiling)
git push -u origin feature/nima-qilyapman
```
Keyin GitHub'da **Pull Request (PR)** oching → sherigingiz ko'rib **master**ga qo'shadi.

## 5. Kun oxirida
Ishingiz **commit + push** qilingan bo'lsin. (Saqlanmagan ish = yo'qolish xavfi.)

---

## ⚠️ TA'QIQLAR (qilmang)
- ❌ Mavjud loyihada `git init` (bog'lanmagan tarix → katta chalkashlik)
- ❌ `.env` ni commit qilish (sirlar). Yangi sozlama bo'lsa → `.env.example`ga yozing
- ❌ `node_modules`, `dist`, `dev.db` ni commit qilish (allaqachon `.gitignore`da)
- ❌ Push'dan oldin `pull` qilmaslik
- ❌ Bir vaqtda ikkingiz bitta faylni tahrirlash (kelishib oling)
- ❌ `git push --force` (master'da) — sherigingiz ishini o'chiradi

---

## 🔧 Tez-tez uchraydigan holatlar

### Sherigim push qildi, menda eski versiya
```bash
git checkout master
git pull
```

### Konflikt chiqdi (CONFLICT)
1. `git status` — qaysi fayllar konflikt ekanini ko'rsatadi
2. Faylni oching: `<<<<<<<`, `=======`, `>>>>>>>` belgilarini toping
3. To'g'ri variantni qoldirib, belgilarni o'chiring
4. `git add <fayl>` → `git commit`

### Ishimni vaqtincha chetga qo'yib turish kerak
```bash
git stash            # o'zgarishlarni vaqtincha saqlaydi
git pull
git stash pop        # qaytarib oladi
```

### Adashdim, oxirgi commit'ni bekor qilmoqchiman (hali push qilmagan bo'lsam)
```bash
git reset --soft HEAD~1     # commit'ni bekor qiladi, o'zgarishlar qoladi
```

### Migratsiya (Prisma) — DIQQAT
Sxema (`schema.prisma`) o'zgartirsangiz:
```bash
git pull                                    # AVVAL torting
npx prisma migrate dev --name nima_ozgardi  # keyin migratsiya yarating
git add -A && git commit -m "..." && git push
```
Ikkingiz bir vaqtda migratsiya yaratmang — biri qilsin, push qilsin, ikkinchisi pull qilsin.

---

## 📌 Foydali buyruqlar
| Buyruq | Nima qiladi |
|---|---|
| `git status` | Hozir nima o'zgargani |
| `git pull` | Remote'dan yangiliklarni olish |
| `git push` | O'z commitlarini yuborish |
| `git log --oneline -10` | Oxirgi 10 commit |
| `git branch` | Lokal branchlar ro'yxati |
| `git checkout master` | master'ga o'tish |
| `git diff` | Hali commit qilinmagan o'zgarishlar |

---

## 🧭 Qisqa eslatma (har kungi sikl)
```
pull  →  branch  →  ishlash  →  commit  →  pull  →  push  →  PR
```
(torting → branch oching → ishlang → commit → torting → push → PR)
