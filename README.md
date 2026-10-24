# Febro Personal Website v1.4

A lightweight personal portfolio website inspired by the structure of nurhamim.com, adapted for Febro Herdyanto. Backend: Node.js, SQLite (built-in `node:sqlite`), optional `nodemailer` for SMTP; hosting: Ubuntu + PM2 + Nginx, **no Docker**. Project folder `/opt/febro`, port `3090`, domain `febro.id`. Separate from `/opt/febro-landing` which serves `profile.febro.id`.

## New in v1.4

- CV request workflow: administrator approval, transactional HTML email, 72-hour signed-random token download link, PDF from private data, resend/revoke.
- Contact page: secure contact form, HTML notifications and private admin inbox, no full page reload.
- Portfolio: category groups with admin-managed create/rename/order controls and project category dropdown; view-only project cards without disclosure label.
- Tools: working category filters and viewport-covering, responsive modal; 15 browser calculators (IT + Electricity).
- SQLite migrations preserve existing profile, media, projects and admins.

See [`UPGRADE-v1.4.md`](UPGRADE-v1.4.md) for the exact commands and SMTP configuration. To create an admin on a clean installation, run `npm run admin:create -- --email you@example.com`.

## Important URLs

- `/` — homepage
- `/portfolio` — projects grouped by user-defined category
- `/tools` — IT + Electricity calculators
- `/contact` — contact form
- `/cv` — public CV summary and Request CV form
- `/admin/login` — CMS login
- `/admin/cv-requests` — approve, reject, revoke, resend CV links
- `/admin/project-categories` — sections and ordering
- `/admin/contact-messages` — private contact inbox

## Confidentiality

`/cv.pdf` is disabled. CV PDF can only be obtained from an approved, unexpired, 256-bit random-token URL; only SHA-256 hash of token stored server-side. Do not link private corporate documents in public projects. All secrets go in `.env` (not included in ZIP), and DB + uploads are excluded from the release package.

## Test

```bash
npm run check
npm test
npm run smtp:test  # optional live SMTP authentication verification after configuring mailbox
```
