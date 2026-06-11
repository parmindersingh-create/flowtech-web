# FlowTech Deployment SOP (Standard Operating Procedures)

## Server Details
- **Server Provider:** Hetzner Cloud
- **Server Name:** flowtech-factory
- **Server IP:** 167.233.37.7
- **SSH Key:** `/tmp/flowtech-ssh/id_ed25519_new` (local copy)
- **Project Path on Server:** `/app/flowtech/`
- **Deployment Method:** Docker Compose
- **Stack:** MongoDB + FastAPI Backend + Nginx (React frontend)

---

## Architecture
```
Internet → Nginx (port 80/443) → Backend (port 8000) → MongoDB (port 27017)
                    ↓
            Serves static frontend files
```

- **Nginx** handles all incoming traffic, serves frontend static files, proxies API calls to backend
- **Backend** (FastAPI/uvicorn) handles `/api/*` routes
- **MongoDB** stores all application data
- **Frontend** is built locally and served as static files by nginx

---

## File Locations on Server
```
/app/flowtech/
├── docker-compose.yml          # Orchestrates all services
├── nginx/
│   └── nginx.conf              # Nginx reverse proxy config
├── backend/                    # FastAPI backend code
│   ├── server.py
│   ├── requirements.txt
│   └── ...
└── frontend/build/             # Built React frontend (static files)
```

---

## How to Deploy Updates

### 1. Update Backend Code
```bash
ssh -i /tmp/flowtech-ssh/id_ed25519_new root@167.233.37.7
cd /app/flowtech
git pull origin main
docker-compose up -d --build backend
```

### 2. Update Frontend
Build locally first:
```bash
cd /tmp/flowtech-web-temp/frontend
yarn build
```

Then copy to server:
```bash
scp -i /tmp/flowtech-ssh/id_ed25519_new -r /tmp/flowtech-web-temp/frontend/build/* root@167.233.37.7:/app/flowtech/frontend/build/
```

Restart nginx:
```bash
ssh -i /tmp/flowtech-ssh/id_ed25519_new root@167.233.37.7 "cd /app/flowtech && docker-compose restart nginx"
```

### 3. Full Redeploy (backend + frontend)
```bash
ssh -i /tmp/flowtech-ssh/id_ed25519_new root@167.233.37.7
cd /app/flowtech
git pull
docker-compose down
docker-compose up -d --build
```

---

## Docker Compose Commands

| Command | Purpose |
|---------|---------|
| `docker-compose up -d` | Start all services in background |
| `docker-compose down` | Stop and remove all containers |
| `docker-compose ps` | Check running containers |
| `docker-compose logs -f backend` | Watch backend logs |
| `docker-compose logs -f nginx` | Watch nginx logs |
| `docker-compose restart backend` | Restart only backend |
| `docker-compose restart nginx` | Restart only nginx |

---

## MongoDB Backup & Restore

### Backup
```bash
ssh -i /tmp/flowtech-ssh/id_ed25519_new root@167.233.37.7
cd /app/flowtech
docker-compose exec mongodb mongodump --out /data/db/backup
tar -czf /tmp/mongodb-backup.tar.gz /var/lib/docker/volumes/flowtech_mongo_data/_data/backup
```

### Restore
```bash
docker-compose exec mongodb mongorestore /data/db/backup
```

---

## APK Update Process

When server IP/domain changes:
1. Update `EXPO_PUBLIC_BACKEND_URL` in `frontend/app.json`
2. Commit and push to `flowtech-apk` repo
3. GitHub Actions auto-builds new APK
4. Download from Actions artifacts

---

## Troubleshooting

### Website not loading
```bash
docker-compose ps              # Check if containers are running
docker-compose logs nginx      # Check nginx errors
docker-compose logs backend    # Check backend errors
```

### "Method Not Allowed" or API errors
- Backend code issue → check `docker-compose logs backend`
- Frontend calling wrong endpoint → rebuild frontend and redeploy

### MongoDB connection errors
```bash
docker-compose ps mongodb      # Check MongoDB is running
docker-compose logs mongodb    # Check MongoDB logs
```

### SSL/Certificate issues
```bash
certbot --nginx -d flowtechfactory.shop
```

---

## Domain & DNS
- Domain: `flowtechfactory.shop`
- Point A record to: `167.233.37.7`
- SSL via Certbot (Let's Encrypt)

---

## GitHub Repos
- **Web + Backend:** `https://github.com/parmindersingh-create/flowtech-web`
- **Mobile APK:** `https://github.com/parmindersingh-create/flowtech-apk`

---

## Important Notes
- NEVER deploy manually to multiple directories
- ALWAYS use `docker-compose` for deployments
- NEVER edit files directly on server — edit locally, commit, pull, rebuild
- Keep SSH key secure — `id_ed25519_new` is the only access method
