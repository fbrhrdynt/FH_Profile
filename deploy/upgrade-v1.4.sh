#!/usr/bin/env bash
# Febro v1.4 safe update. No changes to /opt/febro-landing, Nginx or PocketBase.
set -Eeuo pipefail
APP=/opt/febro
ZIP=/home/ubuntu/Febro-Personal-Website-v1.4.zip
BACKUP="/home/ubuntu/febro-backups/v1.4-$(date +%Y%m%d-%H%M%S)"
if [[ "$(id -un)" != 'ubuntu' ]]; then echo 'Run as Linux user ubuntu'; exit 1; fi
if [[ ! -f "$ZIP" || ! -f "$APP/server.js" ]]; then echo "Missing ZIP or $APP/server.js"; exit 1; fi
command -v unzip >/dev/null && command -v pm2 >/dev/null && command -v node >/dev/null || { echo 'unzip / pm2 / node is missing';exit 1; }
mkdir -p "$BACKUP"; chmod 700 "$BACKUP"
cd "$APP"
echo ">>> Backup code and SQLite to $BACKUP"
tar -czf "$BACKUP/code.tar.gz" --exclude='./data' --exclude='./public/uploads' --exclude='./node_modules' -C "$APP" .
if [[ -f "$APP/.env" ]]; then cp -p "$APP/.env" "$BACKUP/.env"; chmod 600 "$BACKUP/.env"; fi
BACKUP_DIR="$BACKUP" node <<'JS'
const fs=require('node:fs');const {DatabaseSync,backup}=require('node:sqlite');
const dbPath='/opt/febro/data/profile.sqlite';
if(fs.existsSync(dbPath)){
 const db=new DatabaseSync(dbPath);
 backup(db,process.env.BACKUP_DIR+'/profile.sqlite').then(()=>db.close(),err=>{console.error(err);db.close();process.exitCode=1});
}
JS
rollback(){
 local result=$?
 trap - EXIT
 if [[ "$result" -ne 0 ]]; then
  echo '>>> Upgrade failed. Restore previous code (DB backup remains preserved).'
  tar -xzf "$BACKUP/code.tar.gz" -C "$APP"
  cd "$APP"
  pm2 restart febro --update-env || true
 fi
 exit "$result"
}
trap rollback EXIT
# ZIP does NOT contain .env, database, public/uploads, or any secret.
unzip -oq "$ZIP" -d "$APP"
cd "$APP"
chmod 700 "$APP/data"
# Install mail dependency for Hostinger SMTP
npm install --omit=dev --no-audit --no-fund
npm run check
npm test
pm2 restart febro --update-env
ready=0
for i in $(seq 1 25); do
 if curl -fsS --max-time 2 http://127.0.0.1:3090/health >/dev/null; then ready=1;break;fi
 sleep 1
done
if [[ "$ready" != '1' ]];then echo 'PM2 health check failed';pm2 logs febro --lines 40 --nostream || true; exit 1;fi
for endpoint in /contact /cv /portfolio /tools; do
 curl -fsS --max-time 3 "http://127.0.0.1:3090${endpoint}" >/dev/null || { echo "Page broken: $endpoint";exit 1; }
done
pm2 save
trap - EXIT
echo ''
echo '>>> Upgrade v1.4 completed successfully'
echo "Backup: $BACKUP"
echo 'Website: https://febro.id'
echo 'CV admin: https://febro.id/admin/cv-requests'
echo 'Categories: https://febro.id/admin/project-categories'
echo 'Contact inbox: https://febro.id/admin/contact-messages'
echo 'Configure SMTP securely: bash /opt/febro/deploy/configure-smtp.sh'
