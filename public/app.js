import { layout, hero, esc } from './ui.js?v=13';
import { member } from './member.js?v=15';
import { host } from './host.js?v=22';

const path = location.pathname;
try {
  if (path.startsWith('/c/')) await member(path);
  else if (path === '/host') await host();
  else layout('<div class="narrow">' + hero('Club', 'OLDPREN', '') +
    '<section class="panel"><h2>Buka tautan grup</h2><p>Gunakan link dari grup untuk melihat tierlist dan daftar main Selasa.</p><a class="button" href="/host">Masuk sebagai host</a></section></div>');
} catch (error) {
  layout('<div class="narrow"><section class="panel"><h1>Halaman tidak bisa dibuka</h1><p>' + esc(error.message) + '</p><a class="button" href="/">Ke depan</a></section></div>');
}
