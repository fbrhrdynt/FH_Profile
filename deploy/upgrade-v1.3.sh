#!/usr/bin/env bash
# Upgrade ONLY /opt/febro; never modifies /opt/febro-landing, Nginx, or PocketBase.
set -Eeuo pipefail
APP=/opt/febro
ZIP=/home/ubuntu/Febro-Personal-Website-v1.3.zip
BACKUP="/home/ubuntu/febro-backups/v1.3-$(date +%Y%m%d-%H%M%S)"
[[ "$(id -un)" == ubuntu ]] || { echo 'Must run as ubuntu';exit 1; }
[[ -f "$ZIP" && -f "$APP/server.js" ]] || { echo "Missing $ZIP or $APP/server.js";exit 1; }
command -v pm2 >/dev/null && command -v unzip >/dev/null || { echo 'Install pm2 and unzip before upgrading.';exit 1; }
mkdir -p "$BACKUP"
cd "$APP"
echo ">>> Backup source and SQLite: $BACKUP"
tar -czf "$BACKUP/code.tar.gz" --exclude='./data' --exclude='./public/uploads' -C "$APP" .
BACKUP_DIR="$BACKUP" node <<'JS'
const fs=require('node:fs');const {DatabaseSync,backup}=require('node:sqlite');
const filename='/opt/febro/data/profile.sqlite';
if(!fs.existsSync(filename))process.exit(0);
const db=new DatabaseSync(filename);
backup(db,process.env.BACKUP_DIR+'/profile.sqlite').then(()=>db.close(),err=>{console.error(err);db.close();process.exit(1)});
JS
# For failure after extraction, restore old code but retain additive DB schema changes.
rollback(){
  status=$?
  if [[ "$status" -ne 0 ]];then
    echo '>>> ERROR - restoring previous code; database backup remains at' "$BACKUP"
    tar -xzf "$BACKUP/code.tar.gz" -C "$APP"
    cd "$APP"
    pm2 restart febro --update-env || true
  fi
  exit "$status"
}
trap rollback EXIT
unzip -o -q "$ZIP" -d "$APP"
# Preserve user-managed data, private .env and uploaded media.
cd "$APP"
echo '>>> Install dependency for optional SMTP notifications'
npm install --omit=dev --no-audit --no-fund
npm run check
npm test
pm2 restart febro --update-env
healthy=0
for i in $(seq 1 25);do
  if curl --fail --silent --max-time 2 http://127.0.0.1:3090/health >/dev/null;then healthy=1;break;fi
  sleep 1
done
[[ "$healthy" == 1 ]] || { echo 'Local health check failed';pm2 logs febro --lines 30 --nostream;false; }
pm2 save
trap - EXIT
echo '>>> Deployment successful'
echo "Backup: $BACKUP"
echo 'Website: https://febro.id'
echo 'Admin:   https://febro.id/admin/login'
echo 'CV req:  https://febro.id/admin/cv-requests'
