#!/bin/bash
# ============================================================
#  Robbit Quiz — Server sozlash skripti (bir martalik)
#  Server: Ubuntu 22.04 / 24.04
#  Foydalanish: bash server-setup.sh
# ============================================================
set -e

echo ""
echo "===== Robbit Quiz Server Setup ====="
echo ""

# ---------- 1. Tizim yangilash ----------
echo "[1/7] Tizim yangilanmoqda..."
apt-get update -q && apt-get upgrade -y -q

# ---------- 2. Node.js 22 ----------
echo "[2/7] Node.js 22 o'rnatilmoqda..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node --version && npm --version

# ---------- 3. PM2 ----------
echo "[3/7] PM2 o'rnatilmoqda..."
npm install -g pm2
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

# ---------- 4. PostgreSQL ----------
echo "[4/7] PostgreSQL o'rnatilmoqda..."
apt-get install -y postgresql postgresql-contrib

# PostgreSQL ishga tushirish
systemctl enable postgresql
systemctl start postgresql

# Baza va foydalanuvchi yaratish
DB_PASS="${DB_PASS:-$(openssl rand -base64 20 | tr -dc 'a-zA-Z0-9' | head -c 24)}"
echo ""
echo ">>> PostgreSQL paroli yaratildi: $DB_PASS"
echo ">>> Bu parolni .env.production ga qo'ying!"
echo ""

sudo -u postgres psql <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'robbit') THEN
    CREATE USER robbit WITH PASSWORD '$DB_PASS';
  ELSE
    ALTER USER robbit WITH PASSWORD '$DB_PASS';
  END IF;
END
\$\$;
EOF

sudo -u postgres psql -c "CREATE DATABASE robbit_quiz OWNER robbit;" 2>/dev/null || echo "Baza allaqachon mavjud"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE robbit_quiz TO robbit;" 2>/dev/null || true
# PostgreSQL 15+ da public schema izni alohida beriladi
sudo -u postgres psql -d robbit_quiz -c "GRANT ALL ON SCHEMA public TO robbit;" 2>/dev/null || true
sudo -u postgres psql -d robbit_quiz -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO robbit;" 2>/dev/null || true
# Prisma shadow DB uchun (migrate dev)
sudo -u postgres psql -c "ALTER USER robbit CREATEDB;" 2>/dev/null || true

echo "DATABASE_URL=\"postgresql://robbit:${DB_PASS}@localhost:5432/robbit_quiz?schema=public\"" > /root/db_credentials.txt
echo "Hisob ma'lumotlari /root/db_credentials.txt ga saqlandi"

# Ulanishni tekshirish
echo ">>> PostgreSQL ulanishini tekshirish..."
PGPASSWORD="$DB_PASS" psql -U robbit -h localhost -d robbit_quiz -c "SELECT version();" \
  && echo ">>> ✅ PostgreSQL ulanish MUVAFFAQIYATLI" \
  || echo ">>> ❌ PostgreSQL ulanish XATO — pg_hba.conf ni tekshiring"

# ---------- 5. Nginx ----------
echo "[5/7] Nginx o'rnatilmoqda..."
apt-get install -y nginx
systemctl enable nginx
systemctl start nginx

# Nginx config
cat > /etc/nginx/sites-available/robbit-quiz <<'NGINX'
server {
    listen 80;
    server_name robbitquiz.uz www.robbitquiz.uz;

    # Bot/crawler'lardan himoya
    location = /robots.txt { return 200 "User-agent: *\nDisallow: /api/\n"; }

    # Katta fayllar (PDF upload)
    client_max_body_size 20M;

    location / {
        proxy_pass         http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # /uploads — kesh uzun (rasm o'zgarsa fayl nomi o'zgaradi)
    location /uploads/ {
        proxy_pass       http://localhost:4000;
        proxy_set_header Host $host;
        expires          7d;
        add_header       Cache-Control "public, immutable";
    }
}
NGINX

ln -sf /etc/nginx/sites-available/robbit-quiz /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "Nginx sozlandi: http://robbitquiz.uz"

# ---------- 6. HTTPS (Let's Encrypt) ----------
echo "[6/7] HTTPS (certbot) sozlanmoqda..."
apt-get install -y certbot python3-certbot-nginx

echo ""
echo ">>> Domen DNS sozlanganmi? (quiz.robbit.uz → 157.173.114.153)"
read -p ">>> HTTPS o'rnatilsinmi? (y/n): " yn
if [ "$yn" = "y" ]; then
    certbot --nginx -d robbitquiz.uz -d www.robbitquiz.uz --non-interactive --agree-tos -m admin@robbitquiz.uz
    systemctl enable certbot.timer
    echo "HTTPS tayyor! Avtomatik yangilanadi."
else
    echo "HTTPS keyinroq: certbot --nginx -d quiz.robbit.uz"
fi

# ---------- 7. SSH key (GitHub Actions uchun) ----------
echo "[7/7] GitHub Actions SSH kaliti yaratilmoqda..."
KEY_PATH=/root/.ssh/github_actions
ssh-keygen -t ed25519 -f $KEY_PATH -N "" -C "github-actions-robbit-quiz" -y 2>/dev/null || ssh-keygen -t ed25519 -f $KEY_PATH -N "" -C "github-actions-robbit-quiz" <<< y
cat ${KEY_PATH}.pub >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

echo ""
echo "============================================"
echo "✅ Server sozlash TUGADI!"
echo "============================================"
echo ""
echo "Keyingi qadamlar:"
echo ""
echo "1. GitHub repo → Settings → Secrets → Actions:"
echo "   SERVER_HOST  = 157.173.114.153"
echo "   SERVER_USER  = root"
echo "   SERVER_SSH_KEY = (quyidagi private key):"
echo ""
cat $KEY_PATH
echo ""
echo "2. .env.production ni yangilang:"
cat /root/db_credentials.txt
echo ""
echo "3. Birinchi deploy uchun lokal: .\\deploy-quiz.ps1"
echo ""
