# Club OLDPREN

Web untuk roster, daftar main Selasa, pembagian lapangan, laporan skor, dan tierlist satu klub. Paket berisi aplikasi Node.js dan database SQLite yang dibuat saat pertama dijalankan. Gunakan Node.js 24 dan satu proses aplikasi.

## Jalankan di komputer dulu

Ekstrak ZIP lalu jalankan perintah berikut dari folder yang berisi package.json.

~~~sh
npm ci
npm test
npm run setup
npm start
~~~

Buka http://localhost:3000/host. Username dan password kedua host dibuat saat setup dan disimpan di file .env. Buka file itu di perangkat sendiri. Dari halaman host, gunakan **Salin link** untuk mendapatkan tautan anggota. Isi roster dengan nama contoh untuk percobaan.

Aplikasi mengikuti waktu **Asia/Jakarta**. Host bisa menyiapkan sesi dan daftar nama sebelum Selasa dan memulai laga kapan saja selama sesi masih terbuka. Tes otomatis memakai tanggal Selasa tetap agar bisa dijalankan setiap hari.

## Pasang di VPS Linux

1. Gunakan pengguna Linux khusus aplikasi. Ekstrak ZIP ke folder milik pengguna itu, misalnya /opt/club-oldpren.
2. Pasang Node.js 24, lalu jalankan npm ci dan npm run setup dari folder aplikasi. Ubah APP_URL di file .env ke alamat utama HTTPS, misalnya https://badminton.example.com. Alamat ini dipakai untuk link anggota dan login.
3. Setel izin .env ke 600 dengan chmod 600 .env. Simpan konfigurasi dan folder data di lokasi yang hanya bisa diakses pengguna aplikasi. BIND bawaan memakai 127.0.0.1 agar aplikasi hanya menerima sambungan lokal dari proxy. Gunakan PORT lain jika port 3000 sudah terpakai.
4. Arahkan domain ke VPS dan pasang reverse proxy HTTPS. Jika VPS sudah memakai Nginx atau Caddy, tambahkan aplikasi ke konfigurasi yang sudah ada. Contoh satu situs untuk Caddy:

~~~caddyfile
badminton.example.com {
    reverse_proxy 127.0.0.1:3000
}
~~~

5. Jalankan dengan pengelola layanan VPS agar aplikasi tetap hidup saat server restart. Contoh unit systemd berikut memakai pengguna club-oldpren. Sesuaikan lokasi folder dan hasil command -v node dengan instalasi VPS.

~~~ini
[Unit]
Description=Club OLDPREN
After=network.target

[Service]
Type=simple
User=club-oldpren
WorkingDirectory=/opt/club-oldpren
ExecStart=/usr/bin/node --env-file=/opt/club-oldpren/.env /opt/club-oldpren/main.mjs
Restart=on-failure
UMask=0077
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
~~~

Simpan unit sebagai /etc/systemd/system/club-oldpren.service. Jalankan sudo systemctl daemon-reload lalu sudo systemctl enable --now club-oldpren. Cek layanan di /healthz dan login di /host melalui alamat HTTPS. Dari HP lain, buka tautan anggota dan uji satu pertandingan sebelum memasukkan roster asli. Gunakan akun host cadangan untuk memastikan kedua login berjalan.

## Cara pakai

- **Roster** untuk mengisi nama lengkap, nama panggilan opsional, dan tier awal. Pilih F–SS untuk langsung aktif di tier tersebut. Pilih kalibrasi otomatis untuk mulai di F dengan kalibrasi lima pertandingan resmi. Tier awal bisa diubah sampai pemain punya skor resmi pertama.
- **Akun** untuk mengganti username atau password host yang sedang login. Perubahan memerlukan password saat ini dan mengakhiri sesi login akun itu. Password baru harus minimal 14 karakter.
- **Sesi Selasa** di dashboard anggota untuk memilih nama dan mendaftar pada tanggal yang ditetapkan host. Selama sesi masih terbuka, pendaftaran tetap memakai tanggal sesi itu. Setelah host menutup sesi (atau jika tidak ada sesi terbuka), pendaftaran memakai Selasa berikutnya. Host bisa menentukan tanggal saat membuka sesi dan mengubahnya sebelum laga pertama dimulai. Pendaftaran tetap tersimpan per tanggal.
- Saran lapangan berdasarkan jumlah yang mendaftar dengan minimum dua lapangan. Mulai dari 21 pemain, saran naik ke tiga lapangan. Di 28 pemain, saran naik ke empat. Host menetapkan jumlah lapangan saat membuka sesi.
- **Lapangan** di panel host untuk memilih pemain, melihat jumlah main di sesi itu, dan mengatur sampai dua laga antre per lapangan. Saat host menyelesaikan laga, antrean pertama langsung mulai jika semua pemain siap.
- **Skor** hanya bisa diisi dan dikoreksi oleh host. Laga yang selesai masuk ke **Skor belum diisi** sampai host memasukkan hasil. Hasil bisa berakhir di angka berapa pun selama skornya bulat, minimal nol, dan ada pemenang.
- **Tierlist** menampilkan semua tier dari SS sampai F secara default. Pilih satu tier untuk memfilter. Win Rate dihitung dari kemenangan dibagi jumlah pertandingan resmi. Tap nama pemain untuk melihat progres kalibrasi, statistik, dan riwayat perubahan tier. Sistem menghitung ulang riwayat setelah koreksi skor resmi.
- **MVP** menampilkan pemain dengan kenaikan rating bersih tertinggi bulan ini (sementara) dan bulan lalu, mengikuti WIB dan waktu laga selesai. Skor harus resmi. Pemain dengan kenaikan positif yang sama berbagi gelar. Angka rating disimpan di server.

### Perhitungan rating

- Tier F mulai dari 0. Tiap 500 poin naik satu tier sampai SS mulai dari 3.500. Pemain baru dengan kalibrasi otomatis mulai dari tengah Tier F.
- Kekuatan tiap tim dihitung dari rata-rata rating pemainnya. Selisih hingga 100 poin dianggap setara dan hasilnya ±16 poin. Saat tim lebih kuat menang, perpindahannya 2–8 poin. Saat tim lebih lemah menang, perpindahannya 24–30 poin. Selisih skor yang lebih besar menaikkan perpindahan dalam kisaran itu.
- Selama lima pertandingan kalibrasi, kemenangan memberi tiga kali poin dan pengurangan karena kalah dibagi dua (dibulatkan ke atas). Tier awal manual langsung memakai aturan reguler.
- Laga lama dihitung ulang dengan aturan yang berlaku saat laga itu dimainkan, lalu dipetakan ke skala baru sebelum laga dengan aturan baru. Pemetaan mempertahankan tier pemain dan tidak dihitung sebagai kenaikan MVP.

## Backup dan akses

- Folder data, file .env, dan aset perlu dipertahankan saat mengganti versi aplikasi. Untuk backup paling sederhana, hentikan layanan secara normal, salin folder data, lalu jalankan lagi. Simpan salinan .env di lokasi terpisah yang privat.
- Username dan password dari .env digunakan untuk membuat akun saat database pertama kali dijalankan. Perubahan dari menu Akun tersimpan di database. Kalau memindahkan database demo lokal ke VPS, ganti dulu password kedua akun di PC.
- Siapa pun yang menerima tautan grup bisa melihat nama pemain, hasil, statistik, dan mendaftarkan nama dari roster. Kehadiran sebenarnya tetap ditetapkan host.
- Hindari mencatat URL lengkap di access log yang bisa dilihat pihak lain. Tautan anggota memuat kode akses. Untuk mengganti tautan grup yang sudah terlanjur tersebar, ganti GROUP_KEY dengan nilai acak baru di .env, restart, dan bagikan tautan baru dari panel host.

