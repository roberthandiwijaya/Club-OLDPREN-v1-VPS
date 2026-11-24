import { api, root, layout, nav, memberNav, hero, esc, page, dateText, dateShort, tiers, tierBadge, tierCaption, empty, teams, matchStatus, badge, scoreText, bindForm, feedback, popup, run, clipboard, field, button } from './ui.js?v=13';

const endpoint = '/api/host';
const tabs = [['sesi', 'Sesi Selasa'], ['skor', 'Skor'], ['roster', 'Roster'], ['akun', 'Akun']];
const attendanceLabels = { absent: 'Belum hadir', ready: 'Siap main', rest: 'Istirahat', left: 'Sudah pulang' };
const actionButton = (label, payload, style = 'button') =>
  button(label, 'type="button" data-action="' + esc(JSON.stringify(payload)) + '"', style);

function initialTierField(selected = null) {
  const options = tiers.slice().reverse().map(tier => '<option value="' + tier + '"' +
    (tier === selected ? ' selected' : '') + '>Tier ' + tier + '</option>').join('');
  return '<label>Tier awal<select name="initialTier"><option value="">Kalibrasi otomatis (5 pertandingan)</option>' + options + '</select></label>';
}

export async function host() {
  let data;
  let attendanceOpen = !matchMedia('(max-width: 660px)').matches;
  try { data = await api(endpoint); }
  catch (error) { if (error.status !== 401) throw error; }

  function statusOption(status) {
    return Object.entries(attendanceLabels).map(([value, caption]) =>
      '<option value="' + value + '"' + (value === status ? ' selected' : '') + '>' + caption + '</option>').join('');
  }

  function roster() {
    return '<section class="roster-page"><div class="roster-heading"><h1>Roster pemain</h1>' +
      button('Tambah pemain', 'type="button" id="open-add-player"', 'button solid') + '</div>' +
      '<div class="panel roster-panel"><div class="section-head"><h2>Daftar pemain</h2>' +
      badge(data.players.filter(player => !player.archived).length + ' aktif') + '</div>' +
      (data.players.length ? '<ul class="roster-list">' + data.players.map(player =>
        '<li><div><strong>' + esc(player.display) + '</strong><small>' + (player.archived ? 'Diarsipkan' : tierCaption(player)) + '</small></div>' +
        tierBadge(player.tier) + button('Edit', 'type="button" data-edit="' + esc(player.id) + '"', 'button compact roster-edit') + '</li>').join('') +
        '</ul>' : empty('Tambahkan nama pemain untuk mulai mengisi roster.')) + '</div></section>';
  }

  function signups() {
    const names = data.players.filter(player => data.signup.playerIds.includes(player.id));
    return '<section class="panel"><div class="section-head"><div><h2>Daftar main</h2><p>' + esc(dateText(data.signup.date)) + ' · Saran ' + data.signup.courts + ' lapangan</p></div>' + badge(names.length + ' terdaftar') +
      '</div>' + (names.length ? '<ul class="host-list">' + names.map(player => '<li><strong>' + esc(player.display) + '</strong>' +
        actionButton('Keluarkan', { action: 'removeSignup', date: data.signup.date, playerId: player.id }, 'button compact') + '</li>').join('') +
        '</ul>' : empty('Belum ada yang mendaftar dari link grup.')) + '</section>';
  }

  function attendance(session) {
    const players = data.players.filter(player => !player.archived);
    const signups = session.registered;
    return '<details class="panel" id="attendance-panel"' + (attendanceOpen ? ' open' : '') +
      '><summary>Kehadiran pemain <span class="muted">(' + session.present + ' hadir)</span></summary>' +
      (players.length ? '<ul class="host-list">' + players.map(player => {
        const status = session.attendance[player.id]?.status || 'absent';
        return '<li><div><strong>' + esc(player.display) + '</strong>' + (signups.includes(player.id) ? '<small>Sudah daftar main</small>' : '') + '</div>' +
          tierBadge(player.tier) + '<label class="compact-label"><span class="sr">Kehadiran ' + esc(player.display) + '</span><select data-attendance="' + esc(player.id) +
          '"' + (status === 'ready' ? ' class="attendance-ready"' : '') + '>' + statusOption(status) + '</select></label></li>';
      }).join('') + '</ul>' : empty('Tambahkan pemain dari tab Roster.')) + '</details>';
  }

  function courtMatch(session, match, nicknames) {
    const common = { sessionId: session.id, matchId: match.id };
    return '<section class="match"><div class="section-head">' + badge(matchStatus[match.status]) + '</div>' + teams(match, { withTier: true, nicknames }) +
      '<div class="actions">' +
      (match.status === 'queued' ? actionButton('Mulai laga', { ...common, action: 'startMatch' }, 'button solid compact') :
        actionButton('Selesaikan laga', { ...common, action: 'finishMatch' }, 'button solid compact')) +
      actionButton('Batalkan', { ...common, action: 'cancelMatch' }, 'button compact') + '</div></section>';
  }

  function courts(session) {
    const nicknames = new Map(data.players.map(player => [player.id, player.nickname]));
    return '<section><div class="section-head"><h2>Lapangan (' + session.courts + ')</h2><div class="actions"><button type="button" class="button compact" id="manage-courts">Kelola Lapangan</button><a class="button compact" href="#skor">Kelola skor</a></div></div>' +
      (!session.courts ? empty('Belum ada lapangan aktif.') : '') + '<div class="court-grid">' + session.activeCourts.map(court => {
        const matches = session.matches.filter(match => match.court === court && ['active', 'queued'].includes(match.status))
          .sort((a, b) => a.status.localeCompare(b.status));
        return '<article class="panel court"><h3>Lapangan ' + court + '</h3>' +
          (matches.length ? matches.map(match => courtMatch(session, match, nicknames)).join('') : empty('Lapangan kosong.')) +
          (!matches.some(match => match.status === 'queued') ? button('Susun laga', 'type="button" data-court="' + court + '"', 'button full') : '') + '</article>';
      }).join('') + '</div></section>';
  }

  function manageCourts(session) {
    const numbers = session.activeCourts;
    const available = Array.from({length:20}, (_,i) => i+1).filter(n => !numbers.includes(n));
    const rows = numbers.map(n => {
      const busyCourt = session.matches.some(m => m.court === n && ['active','queued'].includes(m.status));
      return '<li><strong>Lapangan ' + n + '</strong>' + (busyCourt ? badge('Ada laga aktif / antre') : button('Nonaktifkan', 'type="button" data-disable-court="' + n + '"', 'button compact')) + '</li>';
    }).join('');
    const dialog = popup('Kelola Lapangan', '<p>' + esc(dateText(session.date)) + ' · Perubahan hanya untuk sesi ini.</p>' +
      (rows ? '<ul class="host-list">' + rows + '</ul>' : empty('Belum ada lapangan aktif.')) +
      (available.length ? '<form class="stack" id="enable-court"><label>Nomor lapangan<select name="court">' + available.map(n => '<option value="' + n + '">Lapangan ' + n + '</option>').join('') + '</select></label><button class="button solid">Tambah / aktifkan lapangan</button></form>' : empty('Semua nomor lapangan sudah aktif.')));
    bindForm('enable-court', form => update({action:'activateCourt', sessionId:session.id, court:Number(form.get('court'))}, dialog), dialog);
    dialog.querySelectorAll('[data-disable-court]').forEach(control => control.addEventListener('click', () => {
      const court = Number(control.dataset.disableCourt);
      if (confirm(`Nonaktifkan Lapangan ${court} untuk sesi ini? Riwayat laga tetap tersimpan.`)) run(control, () => update({action:'deactivateCourt', sessionId:session.id, court}, dialog));
    }));
  }

  function sessionPage(session) {
    const dateField = sessionDateField(data.sessionDate);
    return hero('Operasional', 'Selasa', 'Atur kehadiran, jalankan pertandingan, dan cek skor.') + '<div class="stack">' +
      '<div class="host-frame"><div class="stack">' +
      (session ? '<section class="panel"><div class="section-head"><div><h2>Sesi dibuka</h2><p>' + esc(dateText(session.date)) + '</p></div>' +
        '<div class="actions">' + (session.canReschedule ? button('Ubah tanggal', 'type="button" id="reschedule-session"', 'button compact') : '') +
        actionButton('Tutup sesi', { action: 'closeSession', sessionId: session.id }, 'button compact') + '</div></div></section>' + attendance(session) + courts(session) :
        '<form class="panel stack" id="open-session"><h2>Buka sesi</h2><div class="form-grid session-fields">' + dateField +
        field('courts', 'Jumlah lapangan', 'type="number" min="1" max="20" placeholder="Otomatis"') +
        '</div><p class="muted">Kalau jumlah lapangan kosong, saran dihitung dari daftar main untuk tanggal itu.</p><button class="button solid align-start">Buka sesi</button></form>') +
      '</div><aside class="stack"><section class="panel"><h2>Tautan anggota</h2><p>Untuk tierlist dan daftar main.</p><div class="actions">' +
      '<a class="button compact" href="' + esc(data.groupUrl) + '" target="_blank" rel="noopener noreferrer">Buka dashboard</a>' +
      button('Salin link', 'type="button" id="copy-group"', 'button compact') + '</div></section>' + signups() + '</aside></div></div>';
  }

  function sessionDateField(date) {
    return field('date', 'Tanggal sesi', 'type="date" min="' + esc(data.sessionMinDate) + '" value="' + esc(date) + '" required');
  }

  function rescheduleDialog(session) {
    const dialog = popup('Ubah tanggal sesi', '<form class="stack" id="change-session-date">' +
      sessionDateField(session.date >= data.sessionMinDate ? session.date : data.sessionDate) +
      '<p class="muted">Pilih hari Selasa. Daftar main tersimpan sesuai tanggal yang dipilih tiap anggota.</p>' +
      '<button class="button solid">Simpan tanggal</button></form>');
    bindForm('change-session-date', form => update({
      action: 'rescheduleSession', sessionId: session.id, date: form.get('date'),
    }, dialog), dialog);
  }

  function scores() {
    const sessions = data.sessions.filter(session => session.matches.some(match => ['finished', 'unscored'].includes(match.status)));
    return hero('Kelola', 'Skor', 'Periksa laporan pemain sebelum hasil masuk tierlist.') +
      (sessions.length ? '<div class="stack">' + sessions.map((session, index) =>
        '<details class="panel"' + (index === 0 ? ' open' : '') + '><summary>' + esc(dateText(session.date)) + '</summary><div class="court-grid">' +
        session.matches.filter(match => ['finished', 'unscored'].includes(match.status)).slice().reverse().sort((a, b) => Number(Boolean(a.score)) - Number(Boolean(b.score))).map(match => {
          const common = { sessionId: session.id, matchId: match.id, revision: match.revision };
          const reports = match.reports.filter(report => report.status === 'pending');
          const pending = reports.map(report => {
            const name = match.teams.flat().find(player => player.id === report.playerId).display;
            return '<li><div><strong>' + scoreText(report.score) + '</strong><small>' + esc(name) + '</small></div><div class="actions">' +
              actionButton('Tolak', { ...common, action: 'rejectReport', reportId: report.id }, 'button compact') +
              actionButton('Sahkan', { ...common, action: 'score', score: report.score, reportId: report.id }, 'button solid compact') + '</div></li>';
          }).join('');
          const audit = match.audit.length ? '<details class="audit"><summary>Riwayat pengesahan</summary><ul class="history">' +
            match.audit.slice().reverse().map(row => '<li><time>' + esc(dateShort(row.at)) + '</time><span>' + esc(row.host) + ' · ' +
              (row.previous ? scoreText(row.previous) + ' → ' : '') + (row.score ? scoreText(row.score) : 'Skor dihapus') + '</span></li>').join('') + '</ul></details>' : '';
          return '<article class="match review"><div class="section-head"><h3>Lapangan ' + match.court + '</h3>' +
            badge(match.scoreDeleted ? 'Skor dihapus' : match.score ? 'Skor resmi' : matchStatus[match.status]) + '</div>' + teams(match) +
            (match.score ? '<p class="result">' + scoreText(match.score) + '</p>' : '') +
            (pending ? '<h4>Usulan pemain</h4><ul class="host-list">' + pending + '</ul>' : '') +
            '<div class="actions">' + (match.reportOpen ? button('Tampilkan QR', 'type="button" data-qr="' + esc(match.id) + '"') : '') +
            button(match.score ? 'Koreksi skor' : 'Isi skor', 'type="button" data-score="' + esc(JSON.stringify(common)) + '"') +
            (match.score ? actionButton('Hapus skor', { ...common, action: 'deleteScore' }, 'button compact') : '') +
            actionButton('Hapus laga', { ...common, action: 'deleteMatch' }, 'button compact') + '</div>' + audit + '</article>';
        }).join('') + '</div></details>').join('') + '</div>' : '<section class="panel">' + empty('Skor bisa dicatat setelah pertandingan selesai.') + '</section>');
  }

  let busy = false;
  async function update(payload, dialog) {
    if (busy) return;
    busy = true;
    try {
      data = await api(endpoint, payload);
      dialog?.close();
      render();
      if (payload.action === 'finishMatch') {
        const match = data.sessions.find(item => item.id === payload.sessionId).matches.find(item => item.id === payload.matchId);
        if (match.reportOpen) await showQR(match.id);
        else feedback('Laga selesai. Skor bisa diisi dari tab Skor.');
      } else {
        const captions = { deleteMatch: 'Laga telah dihapus.', deleteScore: 'Skor dihapus dari Riwayat dan statistik pemain.', score: 'Skor resmi disimpan.', rejectReport: 'Usulan skor ditolak.', addPlayer: 'Pemain ditambahkan.', editPlayer: 'Pemain diperbarui.', removeSignup: 'Nama dikeluarkan dari daftar.', rescheduleSession: 'Tanggal sesi diperbarui.' };
        if (captions[payload.action]) feedback(captions[payload.action]);
        if (payload.action === 'archivePlayer') feedback(payload.archived ? 'Pemain diarsipkan.' : 'Pemain diaktifkan kembali.');
      }
    } catch (error) {
      if (error.status === 401) { data = undefined; dialog?.close(); render(); }
      if (error.status === 409 && payload.action === 'createMatch') {
        data = await api(endpoint); dialog?.close(); render();
        throw new Error(error.message + ' Buka Susun laga lagi untuk saran terbaru.');
      }
      if (error.status === 409 && payload.revision !== undefined) { data = await api(endpoint); dialog?.close(); render(); }
      throw error;
    } finally { busy = false; }
  }

  function playerDialog(player) {
    const title = player ? 'Edit pemain' : 'Tambah pemain';
    const dialog = popup(title, '<form id="player-form" class="stack">' +
      field('name', 'Nama lengkap', 'maxlength="100" required value="' + esc(player?.name) + '"') +
      field('nickname', 'Nama panggilan (opsional)', 'maxlength="50" value="' + esc(player?.nickname) + '"') +
      (player?.games ? '<p class="muted">Tier awal terkunci setelah skor resmi pertama.</p>' : initialTierField(player?.initialTier)) +
      '<button class="button solid full">' + (player ? 'Simpan pemain' : title) + '</button></form>' +
      (player ? button(player.archived ? 'Aktifkan kembali' : 'Arsipkan pemain', 'type="button" id="archive-player"', 'quiet roster-archive') : ''));
    bindForm('player-form', form => {
      const changes = { action: player ? 'editPlayer' : 'addPlayer', playerId: player?.id, name: form.get('name'), nickname: form.get('nickname') };
      const tier = form.get('initialTier') || null;
      if (form.has('initialTier') && tier !== (player?.initialTier ?? null)) changes.initialTier = tier;
      return update(changes, dialog);
    }, dialog);
    dialog.querySelector('#archive-player')?.addEventListener('click', event => run(event.currentTarget, () =>
      update({ action: 'archivePlayer', playerId: player.id, archived: !player.archived }, dialog)));
  }

  function compose(session, court) {
    const taken = new Set(session.matches.filter(match => ['active', 'queued'].includes(match.status)).flatMap(match => match.teams.flat().map(player => player.id)));
    const choices = data.players.filter(player => !player.archived && session.attendance[player.id]?.status === 'ready' && !taken.has(player.id));
    if (choices.length < 4) {
      feedback('Butuh empat pemain siap yang belum terjadwal.', true);
      return;
    }
    const playerOptions = choices.map(player => '<option value="' + esc(player.id) + '">' + esc(player.display) + ' · ' + player.tier + '</option>').join('');
    const select = index => '<select aria-label="Pemain ' + (index % 2 + 1) + ' Tim ' + (index < 2 ? 'A' : 'B') + '" name="p' + index +
      '" required><option value="">Pilih pemain ' + (index % 2 + 1) + '</option>' + playerOptions + '</select>';
    const dialog = popup('Susun laga · Lapangan ' + court, '<form id="compose" class="stack"><p class="muted">Pilihan manual tetap di slotnya. Pilih baris kosong untuk melepasnya. Klik lagi untuk melihat alternatif sebelum menyimpan.</p>' +
      '<div class="compose-teams"><fieldset><legend>Tim A</legend>' + select(0) + select(1) + '</fieldset><fieldset><legend>Tim B</legend>' + select(2) + select(3) +
      '</fieldset></div><div class="compose-actions">' + button('Cari susunan seimbang', 'type="button" id="suggest"') +
      '<button class="button solid">Simpan laga</button></div></form>');
    const selectors = [...dialog.querySelectorAll('select')];
    function refreshOptions() {
      for (const control of selectors) {
        for (const option of control.options) {
          option.disabled = Boolean(option.value && selectors.some(other => other !== control && other.value === option.value));
        }
      }
    }
    const pins = selectors.map(() => null);
    const indicator = document.createElement('small');
    indicator.setAttribute('role', 'status');
    dialog.querySelector('.compose-actions').before(indicator);
    let options = [], next = 0, generation = 0;
    selectors.forEach((control, index) => control.addEventListener('change', () => {
      pins[index] = control.value || null;
      options = []; next = 0; generation++; indicator.textContent = '';
      refreshOptions();
    }));
    dialog.querySelector('#suggest').addEventListener('click', event => run(event.currentTarget, async () => {
      if (!options.length) {
        const requested = generation;
        const suggestion = await api(endpoint + '/suggest', { sessionId: session.id, locked: pins });
        if (requested !== generation || !dialog.open) return;
        options = suggestion.alternatives;
      }
      options[next].flat().forEach((playerId, index) => { selectors[index].value = playerId; });
      indicator.textContent = options.length === 1 ? 'Hanya satu susunan sesuai giliran, keseimbangan, dan pilihan manual.' : `Pilihan ${next + 1} dari ${options.length}`;
      next = (next + 1) % options.length;
      refreshOptions();
    }));
    bindForm('compose', form => update({
      action: 'createMatch', sessionId: session.id, court,
      teams: [[form.get('p0'), form.get('p1')], [form.get('p2'), form.get('p3')]],
    }, dialog), dialog);
  }

  async function showQR(matchId) {
    const path = endpoint + '/qr/' + encodeURIComponent(matchId);
    const data = await api(path);
    popup('QR laporan skor', '<p>Pemain bisa scan setelah laga selesai. Berlaku selama sesi Selasa masih buka.</p>' +
      '<img class="qr" src="' + esc(path) + '/image" alt="QR untuk melapor skor pertandingan" width="288" height="288">' +
      '<div class="actions centered"><a class="button" href="' + esc(data.url) + '" target="_blank" rel="noopener noreferrer">Buka formulir</a>' +
      button('Salin link QR', 'id="copy-qr" type="button"') + '</div>');
    clipboard('copy-qr', data.url);
  }

  function manualScore(common) {
    const match = data.sessions.find(session => session.id === common.sessionId).matches.find(item => item.id === common.matchId);
    const value = index => 'required type="number" inputmode="numeric" min="0" max="30" value="' + (match.score?.[index] ?? '') + '"';
    const dialog = popup(match.score ? 'Koreksi skor resmi' : 'Isi skor resmi', teams(match) + '<form id="manual-score" class="stack">' +
      '<div class="score-fields">' + field('a', 'Skor Tim A', value(0)) + field('b', 'Skor Tim B', value(1)) +
      '</div><button class="button solid">Sahkan skor</button></form>');
    bindForm('manual-score', form => update({ ...common, action: 'score', score: [Number(form.get('a')), Number(form.get('b'))] }, dialog), dialog);
  }

  function accountPage() {
    return '<div class="narrow">' + hero('Akun', 'Host', '') +
      '<form id="credentials" class="panel stack account-form"><h2>Ubah akun</h2>' +
      field('username', 'Username', 'required minlength="2" maxlength="40" autocomplete="username" autocapitalize="none" spellcheck="false" value="' + esc(data.host) + '"') +
      field('currentPassword', 'Password saat ini', 'required maxlength="256" type="password" autocomplete="current-password"') +
      '<div class="form-grid">' +
      field('password', 'Password baru', 'minlength="14" maxlength="256" type="password" autocomplete="new-password"') +
      field('confirmation', 'Ulangi password baru', 'minlength="14" maxlength="256" type="password" autocomplete="new-password"') +
      '</div><p class="muted">Isi minimal 14 karakter untuk password baru. Kosongkan kedua kolom kalau hanya mengubah username.</p>' +
      '<button class="button solid align-start">Simpan perubahan</button></form></div>';
  }

  function render() {
    if (!data) {
      layout('<div class="narrow">' + hero('Masuk', 'Host', '') +
        '<form id="login" class="panel stack">' + field('username', 'Username', 'required maxlength="40" autocomplete="username"') +
        field('password', 'Password', 'required maxlength="256" type="password" autocomplete="current-password"') +
        '<button class="button solid">Masuk</button></form></div>', memberNav('host', true), '/');
      bindForm('login', async form => {
        await api(endpoint + '/login', { username: form.get('username'), password: form.get('password') });
        data = await api(endpoint);
        render();
      });
      return;
    }
    const selected = tabs.some(([id]) => id === page()) ? page() : 'sesi';
    const session = data.sessions.find(item => !item.closed);
    const content = selected === 'akun' ? accountPage() : selected === 'roster' ? roster() : selected === 'skor' ? scores() : sessionPage(session);
    layout(content, '<div class="host-nav">' + nav([...tabs, ['tierlist', 'Tierlist', '/?tab=tierlist']], selected) + button('Keluar', 'type="button" id="logout"', 'button compact') + '</div>', '/host');
    root.querySelector('#attendance-panel')?.addEventListener('toggle', event => { attendanceOpen = event.currentTarget.open; });
    clipboard('copy-group', data.groupUrl);
    root.querySelector('#logout').addEventListener('click', event => run(event.currentTarget, async () => {
      await api(endpoint + '/logout', {});
      data = undefined;
      render();
    }));
    root.querySelector('#open-add-player')?.addEventListener('click', () => playerDialog());
    bindForm('credentials', async form => {
      const password = form.get('password');
      if (password !== form.get('confirmation')) throw new Error('Ulangi password baru dengan benar.');
      await api(endpoint + '/credentials', {
        username: form.get('username').trim(),
        currentPassword: form.get('currentPassword'),
        password: password || undefined,
      });
      data = undefined;
      render();
      feedback('Akun sudah diubah. Masuk lagi dengan akun baru.');
    });
    bindForm('open-session', form => {
      const courts = form.get('courts');
      return update({ action: 'openSession', date: form.get('date'), courts: courts ? Number(courts) : undefined });
    });
    root.querySelector('#manage-courts')?.addEventListener('click', () => manageCourts(session));
    root.querySelector('#reschedule-session')?.addEventListener('click', () => rescheduleDialog(session));
    root.querySelectorAll('[data-action]').forEach(control => control.addEventListener('click', () => {
      const payload = JSON.parse(control.dataset.action);
      const questions = { closeSession: 'Tutup sesi ini? QR akan ikut ditutup.', cancelMatch: 'Batalkan pertandingan ini?' };
      if (payload.action === 'deleteScore' || payload.action === 'deleteMatch') {
        const chosen = data.sessions.find(s => s.id === payload.sessionId);
        const match = chosen?.matches.find(m => m.id === payload.matchId);
        if (!match || (payload.action === 'deleteScore' && !match.score)) return;
        const fixture = `${dateText(chosen.date)} · Lapangan ${match.court}\n${match.teams.map(team => team.map(p => p.display).join(' & ')).join(' vs ')}`;
        questions.deleteScore = `Hapus skor ${scoreText(match.score)}?\n${fixture}\nLaga ini tidak akan tampil di Riwayat anggota dan skornya tidak lagi dihitung dalam tierlist.`;
        questions.deleteMatch = `Hapus laga ini secara permanen?\n${fixture}\nSkor: ${scoreText(match.score)}\nLaga, skor, dan semua laporannya akan dihapus. Tindakan ini tidak dapat dibatalkan.`;
      }
      if (questions[payload.action] && !confirm(questions[payload.action])) return;
      run(control, () => update(payload));
    }));
    root.querySelectorAll('[data-attendance]').forEach(control => control.addEventListener('change', () => run(control, async () => {
      try { await update({ action: 'attendance', sessionId: session.id, playerId: control.dataset.attendance, status: control.value }); }
      finally { if (control.isConnected) render(); }
    })));
    root.querySelectorAll('[data-edit]').forEach(control => control.addEventListener('click', () =>
      playerDialog(data.players.find(player => player.id === control.dataset.edit))));
    root.querySelectorAll('[data-court]').forEach(control => control.addEventListener('click', () => compose(session, Number(control.dataset.court))));
    root.querySelectorAll('[data-qr]').forEach(control => control.addEventListener('click', () => run(control, () => showQR(control.dataset.qr))));
    root.querySelectorAll('[data-score]').forEach(control => control.addEventListener('click', () => manualScore(JSON.parse(control.dataset.score))));
  }

  render();
  addEventListener('hashchange', render);
  setInterval(async () => {
    if (!data || document.hidden || busy || !['sesi', 'skor', ''].includes(page()) || document.querySelector('dialog') || root.querySelector('form :focus, select:focus')) return;
    try {
      const updated = await api(endpoint);
      if (!busy && JSON.stringify(updated) !== JSON.stringify(data) && !document.querySelector('dialog') && !root.querySelector('form :focus, select:focus')) {
        data = updated;
        render();
      }
    } catch (error) {
      if (error.status === 401 && !busy) { data = undefined; render(); }
    }
  }, 8000);
}
