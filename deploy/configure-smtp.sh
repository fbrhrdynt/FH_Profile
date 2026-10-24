#!/usr/bin/env bash
# Configure SMTP interactively; secret never appears in shell history or command output.
set -Eeuo pipefail
[[ "$(id -un)" == 'ubuntu' ]] || { echo 'Run as ubuntu'; exit 1; }
APP=/opt/febro
[[ -f "$APP/server.js" ]] || { echo 'Missing application'; exit 1; }
cd "$APP"
[[ -d data ]] || mkdir -p data
read -rsp 'Hostinger email password (hidden): ' SECRET; echo
[[ -n "$SECRET" ]] || { echo 'Password cannot be blank'; exit 1; }
if [[ -f .env ]];then cp -p .env ".env.bak-$(date +%Y%m%d-%H%M%S)";fi
SMTP_PASSWORD="$SECRET" python3 - <<'PY'
from pathlib import Path
import os
p=Path('.env')
old=p.read_text().splitlines() if p.exists() else []
settings={
 'NODE_ENV':'production',
 'APP_URL':'https://febro.id',
 'SMTP_HOST':'smtp.hostinger.com',
 'SMTP_PORT':'465',
 'SMTP_SECURE':'true',
 'SMTP_STARTTLS':'false',
 'SMTP_USER':'info@logisourcedigital.web.id',
 'SMTP_PASS':os.environ['SMTP_PASSWORD'],
 'SMTP_FROM':'Febro Herdyanto - LogiSource Digital <info@logisourcedigital.web.id>',
 'CV_ADMIN_EMAIL':'febroherdyanto@outlook.com',
 'CV_LINK_TTL_HOURS':'72'
}
# Python's dotenv syntax supports JSON-style double-quoted escaped text.
import json
lines=[]
for line in old:
 k=line.partition('=')[0].strip()
 if k in settings:continue
 lines.append(line)
for k,v in settings.items():lines.append(k+'='+json.dumps(v,ensure_ascii=False))
p.write_text('\n'.join(lines)+'\n')
p.chmod(0o600)
PY
unset SECRET
pm2 restart febro --update-env
printf '\nConfiguration saved in /opt/febro/.env (mode 600).\n'
printf 'Test SMTP login: cd /opt/febro && npm run smtp:test\n'
