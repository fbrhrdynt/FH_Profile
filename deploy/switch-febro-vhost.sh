#!/usr/bin/env bash
# Conservative automatic cutover. Only supports a vhost with a direct proxy_pass
# to the known old port. Backs up the original file, tests Nginx, rolls back if invalid.
set -Eeuo pipefail
PATH_ARG="${1:-}"; OLD_PORT="${2:-}"; MODE="${3:---dry-run}"
NEW_PORT=3090
say(){ printf '%s\n' "$*"; }
die(){ say "ERROR: $*" >&2; exit 1; }
[[ "$(id -un)" == ubuntu ]] || die 'Run as Linux user ubuntu.'
[[ "$PATH_ARG" == /etc/nginx/* ]] || die 'Usage: bash deploy/switch-febro-vhost.sh /etc/nginx/path-to-existing-febro-conf OLD_PORT [--dry-run|--apply]'
[[ "$OLD_PORT" =~ ^[0-9]+$ ]] && (( OLD_PORT>=1 && OLD_PORT<=65535 )) || die 'OLD_PORT must be a numeric port.'
[[ "$MODE" == --dry-run || "$MODE" == --apply ]] || die 'Mode must be --dry-run or --apply.'
[[ "$OLD_PORT" != "$NEW_PORT" ]] || die 'Old and new ports must be different.'
[[ -f "$PATH_ARG" ]] || die 'Existing Nginx config does not exist.'
CONF=$(readlink -f "$PATH_ARG")
[[ "$CONF" == /etc/nginx/* ]] || die 'Nginx symlink target is outside /etc/nginx.'
command -v python3 >/dev/null || die 'python3 is required.'
curl -fsS --max-time 5 "http://127.0.0.1:${NEW_PORT}/health" >/dev/null || die 'New site not healthy on local port 3090.'
curl -sS --max-time 5 -o /dev/null "https://profile.febro.id/" || die 'Old site subdomain is not reachable via HTTPS. Aborting.'
# Must be passed a file containing only the two names of the main public domain.
sudo python3 - "$CONF" "$OLD_PORT" <<'PY'
import pathlib,re,sys
config=pathlib.Path(sys.argv[1]).read_text()
old=sys.argv[2]
without_comments=re.sub(r'(?m)#.*$','',config)
names=re.findall(r'\bserver_name\s+([^;]+);',without_comments)
if not names: sys.exit('ERROR: no server_name found. Specify the febro.id vhost, not nginx.conf.')
allnames=set(x for line in names for x in line.split())
if 'febro.id' not in allnames or allnames-{'febro.id','www.febro.id'}:
 sys.exit(f'ERROR: this file declares other domains: {sorted(allnames)}')
pat=r'(\bproxy_pass\s+http://(?:127\.0\.0\.1|localhost):)'+re.escape(old)+r'(?=[/;])'
if not re.search(pat,without_comments):sys.exit('ERROR: no matching direct proxy_pass for the old port. Inspect Nginx before cutover.')
print('Validated original febro.id vhost. Matching old proxy_pass directives:',len(re.findall(pat,without_comments)))
PY
if [[ "$MODE" == --dry-run ]]; then
  say 'DRY RUN ONLY: no files changed.'
  say "To switch the existing site: bash deploy/switch-febro-vhost.sh $PATH_ARG $OLD_PORT --apply"
  exit 0
fi
BACKUP="${CONF}.backup-before-febro-cutover.$(date +%Y%m%d-%H%M%S)"
sudo cp -a "$CONF" "$BACKUP"
sudo python3 - "$CONF" "$OLD_PORT" "$NEW_PORT" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]);old,new=sys.argv[2:]
s=p.read_text();pat=r'(\bproxy_pass\s+http://(?:127\.0\.0\.1|localhost):)'+re.escape(old)+r'(?=[/;])'
s,count=re.subn(pat,lambda m:m.group(1)+new,s)
if not count:sys.exit('No upstream changed.')
p.write_text(s)
print(f'Changed {count} proxy_pass upstream(s) from {old} to {new}.')
PY
if ! sudo nginx -t; then
  sudo cp -a "$BACKUP" "$CONF"
  sudo nginx -t || true
  die 'Nginx test failed. Original file restored.'
fi
if ! sudo systemctl reload nginx; then
  sudo cp -a "$BACKUP" "$CONF"
  sudo nginx -t && sudo systemctl reload nginx || true
  die 'Nginx reload failed. Attempted to restore original config.'
fi
say "Cutover complete: febro.id now proxies to localhost:$NEW_PORT."
say "Original Nginx config backup: $BACKUP"
say 'Old febro-landing app and its PM2 service were not stopped or moved.'
