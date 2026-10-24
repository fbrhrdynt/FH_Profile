#!/usr/bin/env bash
# Add a separate HTTP-only Nginx vhost for the OLD site on profile.febro.id.
# Do NOT change the existing febro.id HTTPS vhost yet.
set -Eeuo pipefail
OLD_PORT="${1:-}"
DOMAIN='profile.febro.id'
CONF="/etc/nginx/conf.d/$DOMAIN.conf"
die(){ echo "ERROR: $*" >&2; exit 1; }
[[ "$(id -un)" == ubuntu ]] || die 'Run as ubuntu.'
[[ "$OLD_PORT" =~ ^[0-9]+$ ]] && (( OLD_PORT>=1 && OLD_PORT<=65535 )) || die 'Usage: bash deploy/stage-profile.sh OLD_FEBRO_LANDING_PORT'
[[ ! -e "$CONF" ]] || die "$CONF already exists. Review it instead of overwriting."
sudo nginx -t || die 'Nginx is not valid before migration.'
if sudo nginx -T 2>/dev/null | grep -Eq 'server_name[[:space:]][^;]*profile\.febro\.id([[:space:];]|$)'; then die "$DOMAIN is already configured in Nginx. Refusing to make a duplicate vhost."; fi
status=$(curl -s --max-time 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${OLD_PORT}/" || true)
[[ "$status" =~ ^[1-5][0-9][0-9]$ ]] || die "Could not connect to the old site on 127.0.0.1:$OLD_PORT. Check your existing nginx proxy port."
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
cat > "$tmp" <<CONFIG
# Migrated old febro-landing website. Existing /opt/febro-landing is untouched.
server {
    listen 80;
    listen [::]:80;
    server_name profile.febro.id;
    client_max_body_size 8m;
    location / {
        proxy_pass http://127.0.0.1:${OLD_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 45s;
    }
}
CONFIG
sudo install -m 644 "$tmp" "$CONF"
if ! sudo nginx -t; then sudo rm -f "$CONF"; die 'Nginx test failed. New vhost removed, old domain untouched.'; fi
sudo systemctl reload nginx
echo "Subdomain vhost staged: http://$DOMAIN => 127.0.0.1:$OLD_PORT."
echo "NEXT: sudo certbot --nginx -d $DOMAIN"
echo "Verify old site and admin over HTTPS on $DOMAIN BEFORE switching febro.id."
