#!/usr/bin/env bash
# Install the NEW app at /opt/febro, WITHOUT modifying any live Nginx virtual host.
set -Eeuo pipefail
APP_NAME='febro'
APP_DIR='/opt/febro'
APP_PORT='3090'
say(){ printf '\n\033[1;34m>>> %s\033[0m\n' "$*"; }
die(){ printf '\nERROR: %s\n' "$*" >&2; exit 1; }
[[ "$(id -un)" == ubuntu ]] || die 'Run this script as Linux user ubuntu (not root).'
[[ -f "$APP_DIR/server.js" && -f "$APP_DIR/ecosystem.config.cjs" ]] || die "Extract the v1.2 ZIP to $APP_DIR first."
[[ "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)" == "$APP_DIR" ]] || die 'Script must be run from /opt/febro.'
for bin in node npm pm2 curl; do command -v "$bin" >/dev/null || die "Missing $bin"; done
node -e 'const [a,b]=process.versions.node.split(".").map(Number);if(a<22||(a===22&&b<13))process.exit(1)' || die 'Node.js >=22.13 is required.'
if ! pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  node -e "require('node:net').createServer().once('error',()=>process.exit(1)).listen(${APP_PORT},'127.0.0.1',function(){this.close()})" || die "Port $APP_PORT is already in use. Do not stop an unknown service; investigate first."
fi
say 'Prepare app folders and permissions'
sudo mkdir -p "$APP_DIR/data" "$APP_DIR/public/uploads"
sudo chown -R ubuntu:ubuntu "$APP_DIR"
chmod 700 "$APP_DIR/data"
chmod 750 "$APP_DIR/public/uploads"
cd "$APP_DIR"
say 'Check application and run tests'
npm run check
npm test
say 'Start PM2 in explicit fork mode, leaving febro-landing untouched'
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  say 'Replace only the febro PM2 entry to ensure fork mode is applied'
  pm2 delete "$APP_NAME"
fi
pm2 start ecosystem.config.cjs
say 'Wait for application startup and health endpoint'
healthy=0
for i in $(seq 1 20); do
  if curl --fail --silent --show-error --max-time 2 "http://127.0.0.1:${APP_PORT}/health" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 1
done
if [[ "$healthy" != 1 ]]; then
  pm2 status "$APP_NAME" || true
  pm2 logs "$APP_NAME" --lines 40 --nostream || true
  die 'New site failed the local health check. Existing nginx remains unchanged.'
fi
curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/health"
pm2 save
cat <<EOM

New app running: /opt/febro — PM2 ${APP_NAME} — localhost:${APP_PORT}
Admin after cutover: https://febro.id/admin/login
No live Nginx vhost was modified. Continue with DEPLOY-MIGRATION.md.
EOM
