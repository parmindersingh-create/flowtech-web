# FlowTech Web - Clean Server Setup Guide

## 1. Create New Hetzner Server
- Ubuntu 24.04 LTS
- Choose a server size (CPX11 minimum recommended)
- Add your SSH key during creation (IMPORTANT — enables key-based login)
- Note the server IP address

## 2. Initial Server Access
```bash
ssh root@YOUR_SERVER_IP
```

## 3. Update System
```bash
apt update && apt upgrade -y
```

## 4. Install Dependencies
```bash
# Python & pip
apt install -y python3 python3-pip python3-venv

# Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Yarn
npm install -g yarn

# MongoDB
apt install -y mongodb
systemctl enable mongodb
systemctl start mongodb

# Nginx
apt install -y nginx

# Git
apt install -y git
```

## 5. Clone Repository
```bash
cd /app
git clone https://github.com/parmindersingh-create/flowtech-web.git
```

## 6. Setup Backend
```bash
cd /app/flowtech-web/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## 7. Configure Environment
```bash
cp .env.example .env  # or create .env with your settings
nano .env
```

## 8. Build Frontend
```bash
cd /app/flowtech-web/frontend
yarn install
CI=false yarn build
```

## 9. Create Systemd Service
```bash
cat > /etc/systemd/system/flowtech.service << 'SERVICEFILE'
[Unit]
Description=FlowTech Web Backend
After=network.target mongodb.service

[Service]
Type=simple
User=root
WorkingDirectory=/app/flowtech-web/backend
ExecStart=/app/flowtech-web/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICEFILE

systemctl daemon-reload
systemctl enable flowtech
systemctl start flowtech
```

## 10. Configure Nginx
```bash
cat > /etc/nginx/sites-available/flowtech << 'NGINXCONF'
server {
    listen 80;
    server_name flowtechfactory.shop;

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /app/flowtech-web/frontend/build;
        try_files $uri $uri/ /index.html;
    }
}
NGINXCONF

ln -sf /etc/nginx/sites-available/flowtech /etc/nginx/sites-enabled/flowtech
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

## 11. Setup SSL (Certbot)
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d flowtechfactory.shop --agree-tos --non-interactive --email your-email@example.com
```

## 12. Verify
```bash
systemctl status flowtech
curl http://127.0.0.1:8000/api/health  # or whatever health endpoint exists
```

## 13. Future Deployments (Simple)
```bash
# Update code
cd /app/flowtech-web && git pull

# Rebuild frontend
cd frontend && yarn build

# Restart backend
systemctl restart flowtech
```

## Troubleshooting
- Check backend logs: `journalctl -u flowtech -f`
- Check nginx logs: `tail -f /var/log/nginx/error.log`
- Check backend directly: `curl http://127.0.0.1:8000/api/health`
