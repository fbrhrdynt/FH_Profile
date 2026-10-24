> **v1.2.1** fixes silent PM2 startup exit (`require.main` guard), forces PM2 fork mode, and adds a startup wait.

# Migrasi website: febro-landing → profile.febro.id dan Febro baru → febro.id

Target final (dua aplikasi independen):

| | Website LAMA | Website BARU (referensi Nur Hamim) |
| --- | --- | --- |
| Domain | `https://profile.febro.id` | `https://febro.id` |
| Lokasi | `/opt/febro-landing` (tetap, tidak di-`mv`) | `/opt/febro` |
| Proses PM2 | Tetap memakai nama lama | `febro` |
| Port | Port lama, cek dari Nginx/PM2 | `3090` pada `127.0.0.1` |
| Admin | `https://profile.febro.id/admin/login` (jika route lama sama) | `https://febro.id/admin/login` |
| Database | Tetap memakai database lama | `/opt/febro/data/profile.sqlite` |
| Linux owner | Jangan ubah jika sudah berfungsi | `ubuntu:ubuntu` |

DNS `profile.febro.id A 161.248.116.14` sudah dibuat oleh pemilik domain. Kedua subdomain/domain harus menuju VPS yang benar; pastikan tidak ada AAAA salah.

**PENTING:** Jangan `mv /opt/febro-landing /opt/febro`! Folder `/opt/febro` untuk website *baru*, sedangkan aplikasi lama tetap menggunakan lokasi lama. Jangan membuat duplikat virtual host `febro.id`; gunakan prosedur cutover setelah website lama bisa diakses dari subdomain.

## Tahap 0. Backup & cek kondisi server

Semua perintah dijalankan di SSH sebagai `ubuntu` (bukan root). Buat backup Nginx dan data website lama sebelum perubahan.

```bash
sudo mkdir -p /home/ubuntu/backup-febro-migration
sudo tar -czf "/home/ubuntu/backup-febro-migration/nginx-$(date +%Y%m%d-%H%M%S).tar.gz" -C /etc nginx
pm2 list
```

Untuk backup website lama yang datanya mungkin sedang aktif, **jangan mengandalkan `tar` atas database SQLite dalam keadaan terbuka**. Gunakan backup database konsisten (SQLite `.backup` bila menggunakan SQLite) dan salin upload/.env sesuai kebutuhan aplikasi lama. Jika database MySQL/MariaDB, gunakan dump (`mysqldump`) sesuai setup; jangan mematikan PM2 lama tanpa rencana.

## Tahap 1. Upload v1.2 dan jalankan website baru di port terpisah

Upload `Febro-Personal-Website-v1.2.zip` ke `/home/ubuntu/` dengan WinSCP/SFTP. Jalankan:

```bash
# Hentikan jika /opt/febro sudah berisi aplikasi lain; jangan overwrite.
if [ -d /opt/febro ] && [ -n "$(ls -A /opt/febro)" ]; then
  echo '/opt/febro sudah berisi file. Periksa dahulu agar tidak tertimpa.'
else
  sudo install -d -o ubuntu -g ubuntu /opt/febro
  unzip -n /home/ubuntu/Febro-Personal-Website-v1.2.zip -d /opt/febro
  cd /opt/febro && bash deploy/install-ubuntu.sh
fi
```

Tahap ini hanya menghidupkan proses PM2 `febro` pada port `3090`, **belum mengganti domain**. Test lokal:

```bash
curl -fsS http://127.0.0.1:3090/health
```

Jika port `3090` sudah digunakan, installer akan berhenti. Jangan kill process yang belum diketahui. Pilih port bebas, lalu sesuaikan `ecosystem.config.cjs`, `deploy/switch-febro-vhost.sh`, dan Nginx secara konsisten sebelum melanjutkan.

## Tahap 2. Temukan port dan file Nginx website LAMA

```bash
cd /opt/febro
bash deploy/preflight.sh
```

Catat dua nilai dari output:

- `OLD_PORT`: port upstream aplikasi `febro-landing` yang saat ini diakses melalui `febro.id` (misal `3010`; **jangan menganggap contoh ini port nyata**).
- `VHOST_PATH`: file konfigurasi Nginx aktif untuk `server_name febro.id`, misalnya `/etc/nginx/conf.d/febro.id.conf` atau `/etc/nginx/sites-enabled/febro.id`. Ambil path riil dari output, **jangan menebak**.

Jika website lama dilayani oleh `root` static-file, socket Unix, atau upstream Nginx yang tidak menggunakan `127.0.0.1:PORT`, skrip otomatis di bawah **tidak sesuai**. Berhenti dan gunakan konfigurasi manual berdasarkan isi Nginx aslinya.

## Tahap 3. Aktifkan website LAMA pada profile.febro.id dahulu

Setelah yakin `OLD_PORT` benar:

```bash
cd /opt/febro
bash deploy/stage-profile.sh OLD_PORT
sudo certbot --nginx -d profile.febro.id
curl -I https://profile.febro.id/
```

Ganti `OLD_PORT` dengan port sebenarnya. Skrip membuat **satu** Nginx vhost baru untuk `profile.febro.id`, diproxy ke *backend lama*, tanpa menyentuh Nginx vhost `febro.id`. Certbot memasang SSL khusus subdomain.

**Verifikasi bahwa UI dan login admin website LAMA bisa digunakan di `https://profile.febro.id`.** Jika website lama punya absolute URL/canonical, `APP_URL`/`NEXT_PUBLIC_SITE_URL`, `ALLOWED_HOSTS`, cookies domain, callback OAuth Google, atau redirect hardcoded `febro.id`, sesuaikan konfigurasi project lama untuk subdomain dan restart hanya proses lamanya. Jangan lanjut cutover jika subdomain belum berfungsi.

## Tahap 4. Alihkan febro.id ke website BARU

Skrip berikut mengubah **hanya** `proxy_pass` ke port lama dalam file vhost utama yang ditentukan, mempertahankan blok TLS `febro.id` dan sertifikat lamanya. Skrip akan backup konfigurasi, memeriksa `nginx -t`, dan rollback jika syntax Nginx gagal.

```bash
cd /opt/febro
# Preview tanpa perubahan
bash deploy/switch-febro-vhost.sh VHOST_PATH OLD_PORT --dry-run

# Setelah output preflight benar dan profil lama berfungsi:
bash deploy/switch-febro-vhost.sh VHOST_PATH OLD_PORT --apply
```

Ganti kedua placeholder dengan nilai faktual. Skrip akan berhenti bila config tidak mengandung `server_name febro.id`, berisi domain-domain lain, atau memakai upstream yang tak dikenali. Jika vhost tersebut mengandung route khusus, static root, atau proxy tambahan yang tidak boleh dialihkan, **JANGAN pakai --apply**; kirim isi vhost (tanpa password/secrets) untuk penyesuaian manual.

Perhatikan `www.febro.id`: jika virtual host `www` berbeda, periksa juga rute dan redirect HTTPS-nya. Jangan buat vhost `febro.id` kedua karena bisa bentrok dengan SSL/Certbot.

## Tahap 5. Buat akun admin website BARU & verifikasi

```bash
cd /opt/febro
npm run admin:create -- --email EMAIL_ADMIN_ANDA
pm2 list
sudo nginx -t
curl -fsS https://febro.id/health
curl -I https://profile.febro.id/
```

Email dipakai login aplikasi BARU; **bukan** username Ubuntu. Password admin diminta secara interaktif (min. 12 karakter). Akun, sessions dan data website lama tidak digunakan ulang.

Alamat akhir:

- Website baru: `https://febro.id`, dashboard: `https://febro.id/admin/login`
- Website lama: `https://profile.febro.id` (halaman admin mengikuti route pada project `febro-landing`)

Jika sudah migrasi, sesuaikan SEO/canonical/sitemap kedua aplikasi dan verifikasi masing-masing di Google Search Console. **Tidak ada redirect `febro.id` → `profile.febro.id`** karena domain utama akan menjadi website baru.

## Rollback

Skrip cutover melaporkan lokasi backup file Nginx, contohnya `...backup-before-febro-cutover.YYYYMMDD-HHMMSS`. Jika perlu mengembalikan `febro.id` ke backend LAMA:

```bash
sudo cp -a /LOKASI/BACKUP/NGINX /LOKASI/VHOST/ASLI
sudo nginx -t && sudo systemctl reload nginx
```

Jangan menjalankan contoh rollback dengan placeholder yang belum diganti. Uji endpoint dan admin setelah rollback.

**Tidak ada akses SSH langsung dari percakapan ini; skrip dan ZIP disiapkan untuk dijalankan oleh user di VPS.**
