# Febro Personal Website v1.3 — Upgrade from v1.2.1

## Existing production configuration

- Source: `/opt/febro`
- Linux user: `ubuntu:ubuntu`
- PM2: `febro` (fork)
- Port: `127.0.0.1:3090`
- Live domain: `https://febro.id`
- Old separate React/PocketBase website: `/opt/febro-landing` -> `https://profile.febro.id`

The zip contains **no production SQLite DB**, sessions, login credentials or avatar files. It does not change Nginx, port allocations or the old PocketBase service. An automatic backup is created before changes. A schema migration only adds a portfolio permission field and private CV request table.

## Install (SSH user `ubuntu`)

1. Upload `Febro-Personal-Website-v1.3.zip` to `/home/ubuntu/` through WinSCP.
2. Run:

```bash
cd /opt/febro
unzip -p /home/ubuntu/Febro-Personal-Website-v1.3.zip deploy/upgrade-v1.3.sh > /home/ubuntu/upgrade-febro-v1.3.sh
chmod +x /home/ubuntu/upgrade-febro-v1.3.sh
bash /home/ubuntu/upgrade-febro-v1.3.sh
```

3. Verify:

```bash
curl -fsS http://127.0.0.1:3090/health
curl -I https://febro.id
pm2 status febro
```

The script backs up both source and consistent SQLite state to `/home/ubuntu/febro-backups/`, installs Nodemailer (only used when SMTP configured), tests the app, restarts only PM2 `febro`, and performs a local health check. If validation fails, previous source is restored. Additive DB migrations are not reversed automatically.

## Admin — Project access

`https://febro.id/admin/content?kind=project` → Edit → **Portfolio access**:
- **View only:** A non-clickable summary card. `/portfolio/<slug>` returns 404.
- **Detail:** Local `/portfolio/<slug>` page.
- **External preview:** Opens the configured app URL in another tab. Local detail remains inaccessible.

Corporate/protected content defaults to View only. On first v1.3 migration, published app examples with known URL use External preview. DWM is made View only by default to protect its industrial/client reporting details. VoltLab gets a public external preview URL (`https://voltlab.febro.id`) if its URL was previously empty. Check all project access settings before sharing.

## CV request / SMTP

CV PDF direct download route is disabled. Requests are saved in SQLite and visible only to the authenticated admin in `/admin/cv-requests`.

**Email alert configuration is optional but needed for email delivery.** Create `/opt/febro/.env` with permissions 600, using `.env.example`. Set a real SMTP password and `CV_NOTIFY_TO`. Avoid sharing secrets in chat or storing `.env` in Git. Restart:

```bash
cd /opt/febro
cp -n .env.example .env
chmod 600 .env
nano .env
pm2 restart febro --update-env
```

Ensure `SMTP_PASS` is replaced (not left as `CHANGE_ME`). Without working SMTP, requests remain safely in `/admin/cv-requests` with notification status `pending`; the form explicitly states a request was recorded, not that an email was sent.

## CV sync from profile.febro.id

Old website uses PocketBase at `127.0.0.1:8095`; its CV collection names and public list permissions must be verified before any claim of automatic synchronization. The site includes a **read-only, optional** PocketBase adapter. Set actual collection names in `.env`:

```text
CV_SYNC_EXPERIENCE=<public_experience_collection>
CV_SYNC_EDUCATION=<public_education_collection>
CV_SYNC_CERTIFICATIONS=<public_certification_collection>
```

Restart only `febro`. It refreshes every 15 minutes with a 2.8-second timeout, does not block homepage loads, and falls back to existing local CMS CV records if PocketBase isn't available. Sync status shows in Admin → CV requests. No write calls to PocketBase; no changes to `/opt/febro-landing`.

Do not guess collection names or enable broad access to private PocketBase collections simply to make sync function; export an intentionally public CV collection if needed.

## Performance

No large frontend framework, no third-party JS libraries or fonts, no tool API calls. Tool forms open client-side instantly in a modal. One small `app.js` and one CSS file; animation supports reduced-motion. Normal network requests still take time; "no loading" means no artificial spinners or full-page navigation for tools.

## Rollback

Use the backup directory printed by the upgrade script. To restore previous source, as `ubuntu`:

```bash
cd /opt/febro
tar -xzf /home/ubuntu/febro-backups/<BACKUP_FOLDER>/code.tar.gz -C /opt/febro
pm2 restart febro --update-env
```

Preserve current database records and requests before any *database* restore; restoring an old backup discards newer edits. Do not copy the old backup database over an actively running website.
