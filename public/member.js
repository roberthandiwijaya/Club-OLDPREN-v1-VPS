import { api, root, layout, memberNav, hero, esc, page, dateText, dateShort, tiers, tierBadge, tierCaption, empty, teams, matchStatus, badge, scoreText, bindForm, feedback, popup } from './ui.js?v=13';

const percent = new Intl.NumberFormat('id-ID', { style: 'percent', maximumFractionDigits: 1 });
const monthLabel = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
const winRate = player => player.games ? percent.format(player.wins / player.games) : '<span aria-label="Belum ada hasil resmi">–</span>';

export async function member(path) {
  const endpoint = '/api/club/' + path.split('/')[2];
  let data = await api(endpoint);
  let selectedTier = 'all';

  function signup() {
    const listed = data.players.filter(player => data.signup.playerIds.includes(player.id)).sort((a, b) => a.display.localeCompare(b.display, 'id'));
    const choices = data.players.filter(player => !data.signup.playerIds.includes(player.id)).sort((a, b) => a.display.localeCompare(b.display, 'id'));
    const options = choices.map(player => '<option value="' + esc(player.id) + '">' + esc(player.display) + '</option>').join('');
    return '<section class="panel signup-panel"><div class="section-head"><div><h2>Daftar main</h2><p>Saran ' + data.signup.courts + ' lapangan</p></div>' + badge(listed.length + ' terdaftar') + '</div>' +
      (choices.length ? '<form class="signup-form" id="signup"><label>Nama lo<select name="player" required><option value="">Pilih nama</option>' + options + '</select></label><button class="button solid">Daftar main</button></form>' :
        empty(data.players.length ? 'Semua nama di roster sudah terdaftar.' : 'Host belum mengisi roster pemain.')) +
      (listed.length ? '<ul class="name-list">' + listed.map(player => '<li>' + esc(player.display) + '</li>').join('') + '</ul>' : '<p class="muted">Belum ada yang daftar.</p>') +
      '</section>';
  }

  function sessionSummary() {
    const session = data.sessions.find(item => item.date === data.signup.date && !item.closed);
    const live = data.sessions.find(item => !item.closed && item.date !== data.signup.date);
    return '<aside class="panel side-card"><h2>Sesi Selasa</h2><div class="accent-line"></div><dl>' +
      '<div><dt>Daftar main untuk</dt><dd>' + esc(dateText(data.signup.date)) + '</dd></div>' +
      '<div><dt>' + (session ? 'Lapangan sesi' : 'Saran lapangan') + '</dt><dd>' + (session?.courts ?? data.signup.courts) + ' lapangan</dd></div>' +
      (live ? '<div><dt>Lapangan sesi berjalan</dt><dd>' + live.courts + ' lapangan</dd></div>' : '') +
      '<div><dt>Pemain terdaftar</dt><dd>' + data.signup.playerIds.length + ' pemain</dd></div></dl>' +
      '<a class="button solid full" href="#sesi">Lihat Sesi Selasa <span aria-hidden="true">→</span></a></aside>';
  }

  function standings() {
    const all = selectedTier === 'all';
    const buttons = ['all', ...tiers].map(tier =>
      '<button type="button" data-tier="' + tier + '" aria-pressed="' + (selectedTier === tier) + '">' + (tier === 'all' ? 'Semua' : tier) + '</button>').join('');
    const groups = (all ? tiers : [selectedTier]).map(tier => {
      const players = data.players.filter(player => player.tier === tier);
      if (!players.length) return '';
      const heading = all ? '<tr class="tier-group"><th scope="rowgroup" colspan="6">Tier ' + tier + '</th></tr>' : '';
      const rows = players.map(player => {
        const record = player.wins + '–' + player.losses;
        const rate = winRate(player);
        const calibration = tierCaption(player);
        return '<tr><td>' + player.rank + '</td><th scope="row"><button class="player-link" data-player="' + esc(player.id) + '">' + esc(player.display) +
          '</button><div class="mobile rank-details"><span>M–K ' + record + '</span><span>Win Rate ' + rate + '</span><small>' + calibration + '</small></div>' +
          '</th><td>' + tierBadge(player.tier) + '</td><td class="desktop">' + calibration +
          '</td><td class="desktop numeric">' + record + '</td><td class="desktop numeric">' + rate + '</td></tr>';
      }).join('');
      return '<tbody>' + heading + rows + '</tbody>';
    }).join('');
    const caption = all ? 'Peringkat semua tier' : 'Peringkat Tier ' + selectedTier;
    return hero('Tierlist', 'Klub', 'Peringkat pemain Club OLDPREN', true) +
      '<div class="board"><section aria-label="Peringkat pemain"><div class="tier-tabs" role="group" aria-label="Pilih tier">' + buttons +
      '</div><div class="ranking"><table><caption class="sr">' + caption + '</caption><thead><tr><th scope="col">#</th><th scope="col">Pemain</th><th scope="col">Tier</th><th scope="col" class="desktop">Kalibrasi</th><th scope="col" class="desktop">M–K</th><th scope="col" class="desktop">Win Rate</th></tr></thead>' +
      (groups || '<tbody><tr><td colspan="6">' + empty(all ? 'Belum ada pemain.' : 'Belum ada pemain di Tier ' + selectedTier + '.') + '</td></tr></tbody>') +
      '</table></div></section>' + sessionSummary() + '</div>';
  }

  function memberMatch(match, nicknames, queuePosition) {
    return '<article class="match"><div class="section-head">' + badge(queuePosition ? 'Antrean ' + queuePosition : match.score ? 'Skor resmi' : matchStatus[match.status]) +
      (match.score ? '<strong class="result">' + scoreText(match.score) + '</strong>' : '') + '</div>' + teams(match, { nicknames }) + '</article>';
  }

  function courts(session) {
    const nicknames = new Map(data.players.map(player => [player.id, player.nickname]));
    return '<section class="member-courts"><div class="section-head"><div><h2>Lapangan</h2><p>' + esc(dateText(session.date)) + '</p></div>' +
      badge(session.courts + ' lapangan · ' + session.present + ' hadir') + '</div><div class="court-grid">' +
      session.activeCourts.map(court => {
        const matches = session.matches.filter(match => match.court === court && ['active', 'queued'].includes(match.status));
        let queuePosition = 0;
        return '<article class="panel member-court"><h3>Lapangan ' + court + '</h3>' + (matches.length ? matches.sort((a, b) => a.status.localeCompare(b.status)).map(match => memberMatch(match, nicknames, match.status === 'queued' ? ++queuePosition : 0)).join('') : empty('Belum ada pertandingan.')) + '</article>';
      }).join('') + '</div></section>';
  }

  function history() {
    const recorded = data.sessions.filter(session => session.matches.some(match => ['finished', 'unscored'].includes(match.status)));
    return hero('Riwayat', 'Selasa', '') +
      (recorded.length ? '<div class="stack">' + recorded.map((session, index) => '<details class="panel"' + (index ? '' : ' open') + '><summary>' + esc(dateText(session.date)) +
        '</summary><div class="court-grid">' + session.matches.filter(match => ['finished', 'unscored'].includes(match.status)).slice().reverse().map(match =>
          '<div><h3>Lapangan ' + match.court + '</h3>' + memberMatch(match) + '</div>').join('') + '</div></details>').join('') + '</div>' :
        '<section class="panel">' + empty('Belum ada pertandingan yang tercatat.') + '</section>');
  }

  function playerMatchHistory(playerId) {
    const sessions = data.sessions.map(session => ({
      date: session.date,
      matches: session.matches.flatMap(match => {
        if (!match.score) return [];
        const side = match.teams.findIndex(team => team.some(player => player.id === playerId));
        return side < 0 ? [] : [{ match, side }];
      }).sort((a, b) => b.match.finishedAt.localeCompare(a.match.finishedAt)),
    })).filter(session => session.matches.length).sort((a, b) => b.date.localeCompare(a.date));

    if (!sessions.length) return empty('Belum ada pertandingan dengan skor resmi.');

    return '<div class="stack">' + sessions.map(({ date, matches }, index) =>
      '<details class="profile-session"' + (index === 0 ? ' open' : '') + '><summary>' + esc(dateText(date)) + '</summary>' +
      matches.map(({ match, side }) => {
        const score = [match.score[side], match.score[1 - side]];
        const partners = match.teams[side].filter(player => player.id !== playerId).map(player => player.display).join(', ');
        const opponents = match.teams[1 - side].map(player => player.display).join(', ');
        return '<article class="match"><div class="actions">' + badge(score[0] > score[1] ? 'Menang' : 'Kalah') +
          '<strong class="result">' + scoreText(score) + '</strong><span>Lapangan ' + match.court + '</span></div>' +
          '<p>Partner: ' + esc(partners) + '</p><p>Lawan: ' + esc(opponents) + '</p></article>';
      }).join('') + '</details>'
    ).join('') + '</div>';
  }

  function profile(playerId) {
    const player = data.players.find(item => item.id === playerId);
    if (!player) return;
    const history = player.history.length ? '<ul class="history">' + player.history.slice().reverse().map(row =>
      '<li><time>' + esc(dateShort(row.date)) + '</time><div>' + tierBadge(row.from) + ' → ' + tierBadge(row.to) + '</div></li>').join('') + '</ul>' :
      empty('Belum ada perubahan tier.');
    popup(player.display, '<div class="profile-tier">' + tierBadge(player.tier) + ' ' + tierCaption(player) + '</div><dl class="stat-row">' +
      '<div><dt>Main</dt><dd>' + player.games + '</dd></div><div><dt>Menang</dt><dd>' + player.wins + '</dd></div><div><dt>Kalah</dt><dd>' + player.losses +
      '</dd></div><div><dt>Win Rate</dt><dd>' + winRate(player) + '</dd></div></dl><h3>Perubahan tier</h3>' + history +
      '<section class="profile-matches"><h3>Riwayat pertandingan</h3>' + playerMatchHistory(playerId) + '</section>');
  }

  function render() {
    const tab = ['sesi', 'riwayat', 'mvp'].includes(page()) ? page() : 'tierlist';
    const current = data.sessions.find(item => !item.closed);
    const body = tab === 'sesi' ? hero('Sesi', 'Selasa', 'Pendaftaran untuk ' + dateText(data.signup.date) + ' (WIB)') + '<div class="stack">' + signup() +
      (current ? courts(current) : '<section class="panel"><h2>Lapangan</h2>' + empty('Host belum membuka sesi.') + '</section>') + '</div>' :
      tab === 'riwayat' ? history() : tab === 'mvp' ? monthlyMvp() : standings();
    layout('<div class="member-' + tab + '">' + body + '</div>', memberNav(tab), path);
    root.querySelectorAll('[data-tier]').forEach(control => control.addEventListener('click', () => {
      selectedTier = control.dataset.tier;
      render();
      root.querySelector('[data-tier="' + selectedTier + '"]')?.focus();
    }));
    root.querySelectorAll('[data-player]').forEach(control => control.addEventListener('click', () => profile(control.dataset.player)));
    bindForm('signup', async form => {
      data = await api(endpoint + '/signup', { date: data.signup.date, playerId: form.get('player') });
      render();
      feedback('Nama sudah masuk daftar main.');
    });
  }

  function monthlyMvp() {
    return hero('Player of the', 'Month', 'Pemain dengan kenaikan bersih tertinggi dari hasil resmi bulan itu.') +
      '<div class="court-grid">' + data.monthlyMvp.map(({ month, winners }, index) =>
        '<section class="panel mvp-panel"><div class="section-head"><h2>' +
        esc(monthLabel.format(new Date(month + '-01T00:00:00Z'))) + '</h2>' + badge(index ? 'Bulan lalu' : 'Sementara') + '</div>' +
        (winners.length ? '<ul class="mvp-winners">' + winners.map(name => '<li>' + esc(name) + '</li>').join('') + '</ul>' :
          empty('Belum ada pemain dengan kenaikan rating.')) + '</section>').join('') + '</div>';
  }

  render();
  addEventListener('hashchange', render);
  setInterval(async () => {
    if (document.hidden || document.querySelector('dialog') || root.querySelector('form :focus')) return;
    try {
      const updated = await api(endpoint);
      if (JSON.stringify(updated) !== JSON.stringify(data) && !root.querySelector('form :focus')) {
        data = updated;
        if (!document.querySelector('dialog')) render();
      }
    } catch { /* Tampilkan data sebelumnya sampai sambungan pulih. */ }
  }, 15000);
}
