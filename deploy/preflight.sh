#!/usr/bin/env bash
# Reports only: no changes to the VPS.
set -euo pipefail
printf '\n==== PM2 processes (Linux user %s) ====\n' "$(id -un)"
pm2 list || true
printf '\n==== Local HTTP listening ports ====\n'
sudo ss -ltnp | grep -E '(nginx|node|pm2|:80[[:space:]]|:443[[:space:]])' || true
printf '\n==== Nginx domain declarations & upstreams ====\n'
for root in /etc/nginx/conf.d /etc/nginx/sites-enabled; do
 [[ -d "$root" ]] && sudo grep -RnE '(server_name|proxy_pass|root[[:space:]])' "$root" 2>/dev/null | grep -E 'febro\.id|profile\.febro\.id|proxy_pass|/opt/(febro|febro-landing)' | head -100 || true
done
printf '\n==== Domain status (without changing routing) ====\n'
for site in febro.id profile.febro.id; do
 curl -sS --max-time 8 -o /dev/null -w "$site %{http_code} %{remote_ip}\n" "https://$site" || true
done
