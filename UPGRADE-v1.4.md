# Febro Personal v1.4 — upgrade in place

This ZIP is an **update for `/opt/febro`** and does not replace `febro-landing` or its PocketBase database.

## Deployment (Ubuntu VPS, Linux account `ubuntu`)

1. Upload `Febro-Personal-Website-v1.4.zip` by SFTP/WinSCP to `/home/ubuntu/`.
2. In SSH, copy/paste:

```bash
cd /opt/febro
unzip -p /home/ubuntu/Febro-Personal-Website-v1.4.zip deploy/upgrade-v1.4.sh > /home/ubuntu/upgrade-febro-v1.4.sh
chmod +x /home/ubuntu/upgrade-febro-v1.4.sh
bash /home/ubuntu/upgrade-febro-v1.4.sh
```

The script backs up source, `.env`, and a consistent SQLite database snapshot in `/home/ubuntu/febro-backups/v1.4-<timestamp>/`. It performs code checks, 11+ integration tests, restarts only the `febro` PM2 process and validates `/health`, `/cv`, `/portfolio`, `/tools` and `/contact`. Source files are restored if upgrade fails; database migrations are additive.

**No Nginx changes required.** `/opt/febro-landing`, PocketBase on port 8095, and `profile.febro.id` are not modified.

## Configure email for real delivery

Run this once (or again to update the mailbox password):

```bash
cd /opt/febro
bash deploy/configure-smtp.sh
npm run smtp:test
```

Enter the **real mailbox password for** `info@logisourcedigital.web.id` interactively. It will NOT appear in shell history. Script preserves unrelated keys already in `.env`, and sets the required SMTP_HOST, SMTP_PORT=465, SMTP_SECURE=true, SMTP_STARTTLS=false, SMTP_FROM, CV_ADMIN_EMAIL=`febroherdyanto@outlook.com`, APP_URL, and CV_LINK_TTL_HOURS=72. The `.env` is private (`chmod 600`). Do not paste passwords into chat or commit `.env` to Git.

`npm run smtp:test` checks SMTP authentication without sending email. To verify *actual delivery* end-to-end, submit a real CV request after deployment and confirm receipt in Outlook. If mail is delayed, also check Junk and the Hostinger mailbox's SPF/DKIM/DMARC setup.

## CV request workflow

1. Visitor opens `febro.id/cv`, chooses **Request CV**, fills the form.
2. System stores request in SQLite and sends an HTML email to `febroherdyanto@outlook.com`, subject `Febro Herdyanto's CV Request #00001` (unique padded request ID).
3. Administrator logs in at `febro.id/admin/cv-requests` and clicks **Approve & email**.
4. System sends an HTML email to the requester containing a random 64-character private link valid for **72 hours**.
5. Upon visiting the link, backend checks hashed token and expiry, generates `Febro-Herdyanto-CV.pdf`, and serves it with `private, no-store`.
6. Administrator may **Resend link** or **Revoke**; revoking invalidates the link. Rejecting a pending request prevents download.

When SMTP fails, request remains in admin with `email_failed` status; it does not silently disappear. Approve will not report success unless sending to requester succeeds. `GET /cv.pdf` remains disabled.

CV PDF data comes from the existing local CMS by default. The optional read-only PocketBase sync is separate and requires confirming actual public collection names from `profile.febro.id`; **this upgrade does not modify PocketBase**.

## Contact form

`febro.id/contact` now has Name, Email, optional Phone, Message and a Send button, no loading page. Visitors see small inline status updates. Message records are saved to the admin inbox at `/admin/contact-messages`. HTML notifications go to the same admin Outlook address. Anti-spam includes honeypot, rate-limit, and input validation.

## Portfolio categories

- In CMS: **Portfolio categories** (`/admin/project-categories`). Create, rename, move Up/Down, or delete empty sections.
- In CMS: **Projects** → Edit → select the desired Category and access mode (View only / Detail / External preview).
- Public `/portfolio` groups project cards under headings in exactly the category order configured in admin.
- Existing categories from v1.3 are retained to avoid deleting or silently changing any project categorization. You may move items into new `Open Source`, `Corporate`, or other custom sections.
- The literal badge `Overview only · No public detail` has been removed. View-only cards have no navigation href; direct detail URL returns 404.

## Tools

15 selected IT / Electricity utilities. Category chips filter instantly without a new page, and a full-backdrop responsive modal contains every calculator. All calculations execute in the user's browser with no remote API. `Esc` closes the modal.

## Troubleshooting

```bash
pm2 status febro
pm2 logs febro --lines 50 --nostream
curl -fsS http://127.0.0.1:3090/health
curl -I https://febro.id/contact
npm run smtp:test
```

No actual email delivery can be verified offline; it depends on your Hostinger credentials, VPS outbound SMTP connectivity, SPF/DKIM/DMARC, and recipient email provider.
