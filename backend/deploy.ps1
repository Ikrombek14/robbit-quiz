# RND Smart Bot — Serverga deploy
# Foydalanish: .\deploy.ps1
# Bu FAQAT rnd-smart-bot'ga tegadi, boshqa botlarga ta'sir qilmaydi!

$server = "root@157.173.114.153"
$remotePath = "/root/bots/rnd-smart-bot"

$files = @(
    "index.js",
    "config.js",
    "utils.js",
    "firebase-config.js",
    "excel_helper.js",
    "stats_aggregator.js",
    "bot.js",
    "broadcast.js",
    "api.js",
    "cron.js",
    "report.js",
    "realtime.js",
    "feedback-store.js",
    "package.json",
    "package-lock.json",
    ".env",
    "firebasekeys.json"
)

Write-Host ""
Write-Host "===== RND Smart Bot Deploy =====" -ForegroundColor Cyan
Write-Host "Server: $server" -ForegroundColor Gray
Write-Host "Papka:  $remotePath" -ForegroundColor Gray
Write-Host ""

# Fayl mavjudligini tekshirish
$missing = @()
foreach ($f in $files) {
    if (-not (Test-Path $f)) { $missing += $f }
}
if ($missing.Count -gt 0) {
    Write-Host "[X] Quyidagi fayllar topilmadi:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
    Write-Host ""
    exit 1
}

# 1. Fayllarni yuborish
Write-Host "[1/2] Fayllar yuborilmoqda... (parol kiriting)" -ForegroundColor Yellow
scp $files "${server}:${remotePath}/"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Papka yo'q bo'lishi mumkin. Yaratib qayta yuboraman..." -ForegroundColor Red
    ssh $server "mkdir -p $remotePath"
    scp $files "${server}:${remotePath}/"
}

# 2. Restart
Write-Host ""
Write-Host "[2/2] Serverda restart... (parol kiriting)" -ForegroundColor Yellow
ssh $server "cd $remotePath && npm install --production 2>&1 && pm2 restart rnd-smart-bot 2>/dev/null || pm2 start index.js --name rnd-smart-bot && echo '' && pm2 logs rnd-smart-bot --lines 15 --nostream"

Write-Host ""
Write-Host "===== Deploy tugadi! =====" -ForegroundColor Green
