import { api, root, layout, nav, memberNav, hero, esc, page, dateText, dateShort, tiers, tierBadge, tierCaption, empty, teams, matchStatus, badge, scoreText, bindForm, feedback, popup, run, clipboard, field, button } from './ui.js?v=13';

const endpoint = '/api/host';
const tabs = [['sesi', 'Sesi Selasa'], ['skor', 'Skor'], ['roster', 'Roster'], ['akun', 'Akun']];
const attendanceLabels = { absent: 'Belum hadir', ready: 'Siap main', rest: 'Istirahat', left: 'Sudah pulang' };
const genderLabels = { pria: 'Laki-laki', wanita: 'Perempuan' };
const genderShapes = {
  pria: 'M8 6h8a2 2 0 0 1 2 2v6h-2V9h-1v13h-2v-7h-2v7H9V9H8v5H6V8a2 2 0 0 1 2-2Z',
  wanita: 'M9 6h6l3 7-1.8.8L14.5 10l2 7H14v5h-2v-5h-1v5H9v-5H7.5l2-7-1.7 3.8L6 13Z',
};
function genderIcon(gender) {
  return Object.hasOwn(genderShapes, gender) ?
    '<svg class="gender-icon gender-' + gender + '" viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="' +
    genderLabels[gender] + '"><title>' + genderLabels[gender] + '</title><circle cx="12" cy="3" r="2"/><path d="' + genderShapes[gender] + '"/></svg>' : '';
}
const actionButton = (label, payload, style = 'button') =>
  button(label, 'type="button" data-action="' + esc(JSON.stringify(payload)) + '"', style);
const needsScore = match => ['finished', 'unscored'].includes(match.status) && !match.score && !match.scoreDeleted;
function sessionGames(session) {
  const counts = new Map();
  for (const match of session.matches.filter(match => ['finished', 'unscored'].includes(match.status))) {
    for (const player of match.teams.flat()) counts.set(player.id, (counts.get(player.id) ?? 0) + 1);
  }
  return counts;
}

function initialTierField(selected = null) {
  const options = tiers.slice().reverse().map(tier => '<option value="' + tier + '"' +
    (tier === selected ? ' selected' : '') + '>Tier ' + tier + '</option>').join('');
  return '<label>Tier awal<select name="initialTier"><option value="">Kalibrasi otomatis (5 pertandingan)</option>' + options + '</select></label>';
}

export async function host() {
  let data;
  let attendanceOpen = !matchMedia('(max-width: 660px)').matches;
  let attendanceQuery = '';
  let attendanceSessionId;
  const selectedAttendance = new Set();
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
        '<li><div><strong class="roster-name"><span>' + esc(player.display) + '</span>' + genderIcon(player.gender) +
        '</strong><small>' + (player.archived ? 'Diarsipkan' : tierCaption(player)) + '</small></div>' +
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
      (players.length ? field('search-attendance', 'Cari pemain', 'type="search" placeholder="Nama atau panggilan" value="' + esc(attendanceQuery) + '" autocomplete="off"') +
        '<label class="attendance-check"><input type="checkbox" id="select-visible-attendance">Pilih semua hasil</label>' +
        '<form id="bulk-attendance" class="attendance-bulk"><div><label for="bulk-attendance-status">Status pilihan</label>' +
        '<select id="bulk-attendance-status" name="status" required><option value="">Pilih status</option>' + statusOption() + '</select></div>' +
        '<button class="button solid" disabled>Terapkan (0)</button></form>' +
        '<p class="empty" id="no-attendance-results" hidden>Tidak ada pemain yang cocok.</p><ul class="host-list">' + players.map(player => {
        const status = session.attendance[player.id]?.status || 'absent';
        return '<li data-attendance-name="' + esc(player.display) + '"><div class="attendance-person"><label class="attendance-check">' +
          '<input type="checkbox" data-attendance-select="' + esc(player.id) + '"><span class="sr">Pilih ' + esc(player.display) + '</span></label>' +
          '<div><strong>' + esc(player.display) + '</strong>' + (signups.includes(player.id) ? '<small>Sudah daftar main</small>' : '') + '</div></div>' +
          tierBadge(player.tier) + '<label class="compact-label"><span class="sr">Kehadiran ' + esc(player.display) + '</span><select data-attendance="' + esc(player.id) +
          '">' + statusOption(status) + '</select></label></li>';
      }).join('') + '</ul>' : empty('Tambahkan pemain dari tab Roster.')) + '</details>';
  }

  function courtMatch(session, match, nicknames, queuePosition, canStart) {
    const common = { sessionId: session.id, matchId: match.id };
    const notReady = queuePosition && match.teams.flat().some(player => session.attendance[player.id]?.status !== 'ready');
    return '<section class="match"><div class="section-head">' + badge(queuePosition ? 'Antrean ' + queuePosition : matchStatus[match.status]) +
      (notReady ? badge('Ada pemain belum siap') : '') + '</div>' + teams(match, { withTier: true, nicknames }) +
      '<div class="actions">' +
      (match.status === 'active' ? actionButton('Selesaikan laga', { ...common, action: 'finishMatch' }, 'button solid compact') :
        canStart && !notReady ? actionButton('Mulai laga', { ...common, action: 'startMatch' }, 'button solid compact') : '') +
      (queuePosition ? button('Edit antrean', 'type="button" data-edit-queue="' + esc(match.id) + '"', 'button compact') : '') +
      actionButton('Batalkan', { ...common, action: 'cancelMatch' }, 'button compact') + '</div></section>';
  }

  function courts(session) {
    const played = sessionGames(session);
    const nicknames = new Map(data.players.map(player => [
      player.id, (player.nickname || player.name) + ' · ' + (played.get(player.id) ?? 0) + 'x main',
    ]));
    const pendingCount = data.sessions.reduce((count, item) => count + item.matches.filter(needsScore).length, 0);
    return '<section><div class="section-head"><h2>Lapangan (' + session.courts + ')</h2><div class="actions"><button type="button" class="button compact" id="manage-courts">Kelola Lapangan</button><a class="button compact" href="#skor">Skor belum diisi (' + pendingCount + ')</a></div></div>' +
      (!session.courts ? empty('Belum ada lapangan aktif.') : '') + '<div class="court-grid">' + session.activeCourts.map(court => {
        const active = session.matches.find(match => match.court === court && match.status === 'active');
        const queue = session.matches.filter(match => match.court === court && match.status === 'queued');
        return '<article class="panel court"><h3>Lapangan ' + court + '</h3>' +
          (active ? courtMatch(session, active, nicknames, 0, false) : empty('Lapangan kosong.')) +
          (queue.length ? '<h4>Antrean (' + queue.length + '/2)</h4>' + queue.map((match, index) => courtMatch(session, match, nicknames, index + 1, !active && index === 0)).join('') : '') +
          (queue.length < 2 ? button('Susun laga', 'type="button" data-court="' + court + '"', 'button full') : '') + '</article>';
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
    function card(session, match) {
      const common = { sessionId: session.id, matchId: match.id, revision: match.revision };
      const audit = match.audit.length ? '<details class="audit"><summary>Riwayat pengesahan</summary><ul class="history">' +
        match.audit.slice().reverse().map(row => '<li><time>' + esc(dateShort(row.at)) + '</time><span>' + esc(row.host) + ' · ' +
          (row.previous ? scoreText(row.previous) + ' → ' : '') + (row.score ? scoreText(row.score) : 'Skor dihapus') + '</span></li>').join('') + '</ul></details>' : '';
      return '<article class="match review"><div class="section-head"><div><h3>Lapangan ' + match.court + '</h3><p>' + esc(dateShort(session.date)) + '</p></div>' +
        badge(match.scoreDeleted ? 'Skor dihapus' : match.score ? 'Skor resmi' : matchStatus[match.status]) + '</div>' + teams(match) +
        (match.score ? '<p class="result">' + scoreText(match.score) + '</p>' : '') +
        '<div class="actions">' +
        button(match.score ? 'Koreksi skor' : 'Isi skor', 'type="button" data-score="' + esc(JSON.stringify(common)) + '"') +
        (match.score ? actionButton('Hapus skor', { ...common, action: 'deleteScore' }, 'button compact') : '') +
        actionButton('Hapus laga', { ...common, action: 'deleteMatch' }, 'button compact') + '</div>' + audit + '</article>';
    }
    const pending = data.sessions.flatMap(session => session.matches.filter(needsScore).reverse().map(match => card(session, match)));
    const history = data.sessions.map(session => {
      const matches = session.matches.filter(match => ['finished', 'unscored'].includes(match.status) && !needsScore(match));
      return matches.length ? '<details class="panel"><summary>' + esc(dateText(session.date)) + '</summary><div class="court-grid">' +
        matches.reverse().map(match => card(session, match)).join('') + '</div></details>' : '';
    }).join('');
    return hero('Kelola', 'Skor', '') + '<div class="stack"><section><h2>Skor belum diisi (' + pending.length + ')</h2>' +
      (pending.length ? '<div class="court-grid">' + pending.join('') + '</div>' : empty('Semua skor sudah dibereskan.')) +
      '</section>' + (history ? '<h2>Riwayat pengisian skor</h2>' + history : '') + '</div>';
  }

  let busy = false;
  async function update(payload, dialog) {
    if (busy) return;
    busy = true;
    try {
      data = await api(endpoint, payload);
      if (payload.action === 'bulkAttendance') selectedAttendance.clear();
      dialog?.close();
      render();
      if (payload.action === 'finishMatch') {
        const session = data.sessions.find(item => item.id === payload.sessionId);
        const match = session.matches.find(item => item.id === payload.matchId);
        const next = session.matches.some(item => item.court === match.court && item.status === 'active');
        feedback((next ? 'Laga berikutnya dimulai. ' : 'Laga selesai. ') + 'Skor bisa diisi belakangan.');
      } else {
        const captions = { deleteMatch: 'Laga telah dihapus.', deleteScore: 'Skor dihapus dari Riwayat dan statistik pemain.', score: 'Skor resmi disimpan.', addPlayer: 'Pemain ditambahkan.', editPlayer: 'Pemain diperbarui.', editQueuedMatch: 'Susunan antrean diperbarui.', removeSignup: 'Nama dikeluarkan dari daftar.', rescheduleSession: 'Tanggal sesi diperbarui.' };
        if (captions[payload.action]) feedback(captions[payload.action]);
        if (payload.action === 'bulkAttendance') feedback('Status ' + payload.playerIds.length + ' pemain diperbarui.');
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
      '<label>Gender (opsional)<select name="gender"><option value="">Belum diisi</option>' +
      Object.entries(genderLabels).map(([value, label]) => '<option value="' + value + '"' +
        (value === player?.gender ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label>' +
      (player?.games ? '<p class="muted">Tier awal terkunci setelah skor resmi pertama.</p>' : initialTierField(player?.initialTier)) +
      '<button class="button solid full">' + (player ? 'Simpan pemain' : title) + '</button></form>' +
      (player ? button(player.archived ? 'Aktifkan kembali' : 'Arsipkan pemain', 'type="button" id="archive-player"', 'quiet roster-archive') : ''));
    bindForm('player-form', form => {
      const changes = { action: player ? 'editPlayer' : 'addPlayer', playerId: player?.id, name: form.get('name'), nickname: form.get('nickname') };
      const gender = form.get('gender') || null;
      if (gender !== (player?.gender ?? null)) changes.gender = gender;
      const tier = form.get('initialTier') || null;
      if (form.has('initialTier') && tier !== (player?.initialTier ?? null)) changes.initialTier = tier;
      return update(changes, dialog);
    }, dialog);
    dialog.querySelector('#archive-player')?.addEventListener('click', event => run(event.currentTarget, () =>
      update({ action: 'archivePlayer', playerId: player.id, archived: !player.archived }, dialog)));
  }

  function compose(session, court, queuedMatch) {
    const current = queuedMatch?.teams.flat().map(player => player.id) ?? [];
    const taken = new Set(session.matches.filter(match => match !== queuedMatch && ['active', 'queued'].includes(match.status)).flatMap(match => match.teams.flat().map(player => player.id)));
    const choices = data.players.filter(player => !player.archived && !taken.has(player.id) &&
      (session.attendance[player.id]?.status === 'ready' || current.includes(player.id)));
    if (choices.length < 4) {
      feedback('Butuh empat pemain siap yang belum terjadwal.', true);
      return;
    }
    const played = sessionGames(session);
    const select = index => '<select aria-label="Pemain ' + (index % 2 + 1) + ' Tim ' + (index < 2 ? 'A' : 'B') + '" name="p' + index +
      '" required></select>';
    const dialog = popup((queuedMatch ? 'Edit antrean' : 'Susun laga') + ' · Lapangan ' + court, '<form id="compose" class="stack"><p class="muted">' +
      (queuedMatch ? 'Ganti pemain yang belum siap. Posisi laga di antrean tetap sama.' : 'Pilihan manual tetap di slotnya. Pilih baris kosong untuk melepasnya. Klik lagi untuk melihat alternatif sebelum menyimpan.') + '</p>' +
      field('search', 'Cari pemain', 'type="search" placeholder="Cari nama atau panggilan" autocomplete="off"') +
      '<div class="compose-teams"><fieldset><legend>Tim A</legend>' + select(0) + select(1) + '</fieldset><fieldset><legend>Tim B</legend>' + select(2) + select(3) +
      '</fieldset></div>' + (queuedMatch ? '<button class="button solid">Simpan antrean</button>' :
        '<div class="compose-actions">' + button('Cari susunan seimbang', 'type="button" id="suggest"') +
        '<button class="button solid">Simpan laga</button></div>') + '</form>');
    const selectors = [...dialog.querySelectorAll('select')];
    const search = dialog.querySelector('[name="search"]');
    function refreshOptions() {
      const values = selectors.map(control => control.value);
      const query = search.value.trim().toLocaleLowerCase('id');
      selectors.forEach((control, index) => {
        const chosen = values[index];
        const available = choices.filter(player => player.id === chosen ||
          (!values.includes(player.id) && player.display.toLocaleLowerCase('id').includes(query)));
        control.innerHTML = '<option value="">' + (available.length ? 'Pilih pemain ' + (index % 2 + 1) : 'Tidak ada pemain cocok') + '</option>' +
          available.map(player => '<option value="' + esc(player.id) + '">' + esc(player.display) +
            ' · ' + player.tier + ' · ' + (played.get(player.id) ?? 0) + 'x main' +
            (session.attendance[player.id]?.status === 'ready' ? '' : ' · Belum siap') + '</option>').join('');
        control.value = chosen;
      });
    }
    search.addEventListener('input', refreshOptions);
    refreshOptions();
    current.forEach((playerId, index) => { selectors[index].value = playerId; });
    refreshOptions();
    bindForm('compose', form => update({
      ...(queuedMatch ? { action: 'editQueuedMatch', matchId: queuedMatch.id, revision: queuedMatch.revision } : { action: 'createMatch', court }),
      sessionId: session.id,
      teams: [[form.get('p0'), form.get('p1')], [form.get('p2'), form.get('p3')]],
    }, dialog), dialog);
    if (queuedMatch) {
      selectors.forEach(control => control.addEventListener('change', refreshOptions));
      return;
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
      search.value = '';
      for (const control of selectors) control.value = '';
      refreshOptions();
      options[next].flat().forEach((playerId, index) => { selectors[index].value = playerId; });
      indicator.textContent = options.length === 1 ? 'Hanya satu susunan sesuai giliran, keseimbangan, dan pilihan manual.' : `Pilihan ${next + 1} dari ${options.length}`;
      next = (next + 1) % options.length;
      refreshOptions();
    }));
  }

  function manualScore(common) {
    const match = data.sessions.find(session => session.id === common.sessionId).matches.find(item => item.id === common.matchId);
    const value = index => 'required type="number" inputmode="numeric" min="0" step="1" value="' + (match.score?.[index] ?? '') + '"';
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
    if (attendanceSessionId !== session?.id) {
      attendanceSessionId = session?.id;
      attendanceQuery = '';
      selectedAttendance.clear();
    }
    const content = selected === 'akun' ? accountPage() : selected === 'roster' ? roster() : selected === 'skor' ? scores() : sessionPage(session);
    layout(content, '<div class="host-nav">' + nav([...tabs, ['tierlist', 'Tierlist', '/?tab=tierlist']], selected) + button('Keluar', 'type="button" id="logout"', 'button compact') + '</div>', '/host');
    root.querySelector('#attendance-panel')?.addEventListener('toggle', event => { attendanceOpen = event.currentTarget.open; });
    const attendanceSearch = root.querySelector('[name="search-attendance"]');
    if (attendanceSearch) {
      const rows = [...root.querySelectorAll('[data-attendance-name]')];
      const noResults = root.querySelector('#no-attendance-results');
      const checks = rows.map(row => row.querySelector('[data-attendance-select]'));
      const selectVisible = root.querySelector('#select-visible-attendance');
      const apply = root.querySelector('#bulk-attendance button');
      const knownIds = new Set(checks.map(check => check.dataset.attendanceSelect));
      for (const id of selectedAttendance) {
        if (!knownIds.has(id)) selectedAttendance.delete(id);
      }
      const visibleChecks = () => checks.filter((_, index) => !rows[index].hidden);
      function syncChecks() {
        for (const check of checks) check.checked = selectedAttendance.has(check.dataset.attendanceSelect);
        const visible = visibleChecks();
        const checked = visible.filter(check => check.checked).length;
        selectVisible.checked = visible.length > 0 && checked === visible.length;
        selectVisible.indeterminate = checked > 0 && checked < visible.length;
        selectVisible.disabled = visible.length === 0;
        apply.disabled = selectedAttendance.size === 0;
        apply.textContent = 'Terapkan (' + selectedAttendance.size + ')';
      }
      function selectCheck(check, checked) {
        const id = check.dataset.attendanceSelect;
        if (checked) selectedAttendance.add(id);
        else selectedAttendance.delete(id);
      }
      const filterAttendance = () => {
        attendanceQuery = attendanceSearch.value;
        const query = attendanceQuery.trim().toLocaleLowerCase('id');
        for (const row of rows) row.hidden = !row.dataset.attendanceName.toLocaleLowerCase('id').includes(query);
        noResults.hidden = rows.some(row => !row.hidden);
        syncChecks();
      };
      for (const check of checks) check.addEventListener('change', () => {
        selectCheck(check, check.checked);
        syncChecks();
      });
      selectVisible.addEventListener('change', () => {
        for (const check of visibleChecks()) selectCheck(check, selectVisible.checked);
        syncChecks();
      });
      attendanceSearch.addEventListener('input', filterAttendance);
      filterAttendance();
    }
    bindForm('bulk-attendance', form => update({
      action: 'bulkAttendance', sessionId: session.id, playerIds: [...selectedAttendance], status: form.get('status'),
    }));
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
      const questions = { closeSession: 'Tutup sesi ini? Antrean yang belum dimainkan akan dibatalkan.', cancelMatch: 'Batalkan pertandingan ini?' };
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
    root.querySelectorAll('[data-edit-queue]').forEach(control => control.addEventListener('click', () => {
      const match = session.matches.find(item => item.id === control.dataset.editQueue);
      compose(session, match.court, match);
    }));
    root.querySelectorAll('[data-score]').forEach(control => control.addEventListener('click', () => manualScore(JSON.parse(control.dataset.score))));
  }

  render();
  addEventListener('hashchange', render);
  setInterval(async () => {
    if (!data || document.hidden || busy || !['sesi', 'skor', ''].includes(page()) || document.querySelector('dialog') || root.querySelector('form :focus, #attendance-panel :focus')) return;
    try {
      const updated = await api(endpoint);
      if (!busy && JSON.stringify(updated) !== JSON.stringify(data) && !document.querySelector('dialog') && !root.querySelector('form :focus, #attendance-panel :focus')) {
        data = updated;
        render();
      }
    } catch (error) {
      if (error.status === 401 && !busy) { data = undefined; render(); }
    }
  }, 8000);
}
