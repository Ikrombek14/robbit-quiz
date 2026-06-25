# ============================================================
#  Robbit Quiz — Serverga deploy (alohida papka)
#  Foydalanish:  .\deploy-quiz.ps1
#  Server:       root@157.173.114.153
#  Papka:        /root/apps/robbit-quiz   (botlarga tegmaydi!)
#  Manzil:       http://157.173.114.153:4000
# ============================================================

$ErrorActionPreference = "Stop"
$server = "root@157.173.114.153"
$remote = "/root/apps/robbit-quiz"
$root   = $PSScriptRoot

Write-Host ""
Write-Host "===== Robbit Quiz Deploy =====" -ForegroundColor Cyan
Write-Host "Server: $server" -ForegroundColor Gray
Write-Host "Papka:  $remote" -ForegroundColor Gray
Write-Host ""

# ---------- 1. Frontend build ----------
Write-Host "[1/5] Frontend build qilinmoqda..." -ForegroundColor Yellow
Set-Location "$root\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "[X] Frontend build xato" -ForegroundColor Red; exit 1 }

# ---------- 2. Backend build ----------
Write-Host "[2/5] Backend build qilinmoqda..." -ForegroundColor Yellow
Set-Location "$root\backend"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "[X] Backend build xato" -ForegroundColor Red; exit 1 }

# ---------- 3. Fayllarni tayyorlash (staging) ----------
Write-Host "[3/5] Fayllar tayyorlanmoqda..." -ForegroundColor Yellow
$stage = "$root\deploy_build"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

Copy-Item "$root\backend\dist"               "$stage\dist"   -Recurse
Copy-Item "$root\frontend\dist"              "$stage\public" -Recurse
Copy-Item "$root\backend\prisma"             "$stage\prisma" -Recurse
Copy-Item "$root\backend\package.json"       "$stage\"
Copy-Item "$root\backend\package-lock.json"  "$stage\"
Copy-Item "$root\backend\ecosystem.config.cjs" "$stage\"
Copy-Item "$root\backend\.env.production"     "$stage\.env"

# Mahalliy dev bazasini yubormaymiz
Remove-Item "$stage\prisma\dev.db" -ErrorAction SilentlyContinue

# Tarball (bitta arxiv — bitta yuborish)
$tgz = "$root\robbit-quiz.tgz"
if (Test-Path $tgz) { Remove-Item $tgz }
tar -czf $tgz -C $stage .
if ($LASTEXITCODE -ne 0) { Write-Host "[X] Arxivlash xato" -ForegroundColor Red; exit 1 }

# ---------- 4. Serverga yuborish ----------
Write-Host "[4/5] Serverga yuborilmoqda... (parol kiriting)" -ForegroundColor Yellow
scp $tgz "${server}:/tmp/robbit-quiz.tgz"
if ($LASTEXITCODE -ne 0) { Write-Host "[X] Yuborish xato" -ForegroundColor Red; exit 1 }

# ---------- 5. Serverda o'rnatish + ishga tushirish ----------
Write-Host "[5/5] Serverda o'rnatilmoqda... (parol kiriting)" -ForegroundColor Yellow
$cmd = @(
  "mkdir -p $remote",
  "tar -xzf /tmp/robbit-quiz.tgz -C $remote",
  "rm -f /tmp/robbit-quiz.tgz",
  "cd $remote",
  "npm install",
  "npx prisma generate",
  "npx prisma migrate deploy",
  "(pm2 restart robbit-quiz || pm2 start ecosystem.config.cjs)",
  "pm2 save",
  "pm2 logs robbit-quiz --lines 20 --nostream"
) -join " && "
ssh $server $cmd

# Tozalash
Remove-Item $tgz -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
Set-Location $root

Write-Host ""
Write-Host "===== Deploy tugadi! =====" -ForegroundColor Green
Write-Host "Ochish: http://157.173.114.153:4000" -ForegroundColor Cyan
Write-Host ""
