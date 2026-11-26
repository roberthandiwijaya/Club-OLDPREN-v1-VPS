import { randomUUID, randomInt } from 'node:crypto';

export const newClub = () => ({ players: [], sessions: [], signups: {}, sequence: 0 });
export const id = randomUUID;
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' });
export const day = now => dateFormat.format(now);
const midnight = date => new Date(date + 'T00:00:00Z');
export const isTuesday = date => midnight(date).getUTCDay() === 2;
const moveDay = (date, days) => new Date(midnight(date).getTime() + days * 86400000).toISOString().slice(0, 10);

export function nextTuesday(club, now, includeToday = true) {
  const today = day(now);
  const days = (9 - midnight(today).getUTCDay()) % 7;
  let date = moveDay(today, days || (includeToday ? 0 : 7));
  while (club.sessions.some(session => session.date === date && session.closed)) date = moveDay(date, 7);
  return date;
}

function signupTuesday(club, now) {
  const openSession = club.sessions.find(session => !session.closed);
  return openSession?.date ?? nextTuesday(club, now, false);
}

function validateSessionDate(club, date, now, sessionId) {
  requireRule(typeof date === 'string' && date.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && isTuesday(date) && day(midnight(date)) === date && date >= day(now), 'Pilih tanggal Selasa, mulai hari ini atau setelahnya (WIB).');
  requireRule(!club.sessions.some(session => session.id !== sessionId && session.date === date), 'Tanggal ini sudah punya sesi.', 409);
  return date;
}

const maxCourts = 20;
// Sessions created before individually numbered courts stored only their count.
const activeCourts = session => session.activeCourts ?? Array.from({ length: session.courts }, (_, i) => i + 1);

function courtPlan(club, date) {
  const playerIds = (club.signups[date] ?? []).filter(playerId =>
    club.players.some(player => player.id === playerId && !player.archived));
  const courts = Math.min(maxCourts, Math.max(2, Math.floor(playerIds.length / 7)));
  return { date, playerIds, courts };
}

export class RuleError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function requireRule(ok, message, status) {
  if (!ok) throw new RuleError(message, status);
}

export function validScore(score) {
  return Array.isArray(score) && score.length === 2 && score.every(value => Number.isSafeInteger(value) && value >= 0) && score[0] !== score[1];
}

const legacyTiers = [['SS', 1160], ['S', 1130], ['A', 1100], ['B', 1075], ['C', 1050], ['D', 1030], ['E', 1015], ['F', -Infinity]];
const legacyStartingRatings = new Map(legacyTiers.map(([tier, minimum], index) => {
  const ceiling = legacyTiers[index - 1]?.[1] ?? minimum + 30;
  return [tier, tier === 'F' ? 1000 : Math.floor((minimum + ceiling) / 2)];
}));
const tierOf = rating => legacyTiers[7 - Math.min(7, Math.floor(rating / 500))][0];
function currentRating(legacyRating) {
  if (legacyRating < 1000) return 250 * Math.exp((legacyRating - 1000) / 15);
  if (legacyRating < 1015) return 250 + (legacyRating - 1000) * 250 / 15;
  const index = legacyTiers.findIndex(([, minimum]) => legacyRating >= minimum);
  const minimum = legacyTiers[index][1];
  const ceiling = legacyTiers[index - 1]?.[1] ?? minimum + 30;
  return (7 - index) * 500 + (legacyRating - minimum) * 500 / (ceiling - minimum);
}
const allMatches = club => club.sessions.flatMap(session => session.matches);
const teamAverage = (team, strength) => team.reduce((total, playerId) => total + strength.get(playerId).rating, 0) / team.length;

function resultPoints(difference, margin, legacy) {
  if (legacy) {
    const expected = 1 / (1 + 10 ** (-difference / 100));
    const base = margin <= 4 ? 3 : margin <= 8 ? 5 : 8;
    return Math.max(1, Math.round(2 * base * (1 - expected)));
  }
  if (Math.abs(difference) <= 100) return 16;
  const marginBonus = Math.max(0, Math.min(6, Math.round((margin - 2) * 6 / 10)));
  return (difference < 0 ? 24 : 2) + marginBonus;
}

export function mvpWinners(entries) {
  const best = entries.reduce((n, entry) => Math.max(n, entry.gain), 0);
  return entries.filter(e => e.gain > 0 && best - e.gain <= Math.max(1, best) * 1e-12).map(e => e.name);
}

export function standings(club, awardMonths = []) {
  const strength = new Map(club.players.map(player => [player.id, {
    rating: currentRating(legacyStartingRatings.get(player.initialTier ?? 'F')), usesCalibration: !player.initialTier,
    games: 0, wins: 0, losses: 0, history: [], monthly: new Map(),
  }]));
  const matches = allMatches(club).filter(match => match.score).sort((left, right) => left.finishOrder - right.finishOrder);
  // A rolled-back server replays ALL prior results with the old rules. Keep its
  // scale separately so each unversioned result uses the delta it actually earned.
  const legacyStrength = new Map(club.players.map(p => [p.id, {rating: legacyStartingRatings.get(p.initialTier ?? 'F')}]));
  let seenV2 = false;

  for (const match of matches) {
    const legacy = match.ratingVersion !== 2;
    if (!legacy) seenV2 = true;
    const winner = Number(match.score[1] > match.score[0]);
    const winnerTeam = match.teams[winner];
    const loserTeam = match.teams[1 - winner];
    const difference = teamAverage(winnerTeam, strength) - teamAverage(loserTeam, strength);
    const margin = Math.abs(match.score[0] - match.score[1]);
    const change = resultPoints(difference, margin, false);
    const oldChange = resultPoints(teamAverage(winnerTeam, legacyStrength) - teamAverage(loserTeam, legacyStrength), margin, true);
    const month = awardMonths.length && match.finishedAt ? day(new Date(match.finishedAt)).slice(0, 7) : null;
    const trackAward = awardMonths.includes(month);

    match.teams.forEach((team, index) => {
      for (const playerId of team) {
        const player = strength.get(playerId);
        const won = index === winner;
        const calibrating = player.usesCalibration && player.games < 5;
        const before = tierOf(player.rating);
        const startingRating = player.rating;
        const adjustment = points => won ? points * (calibrating ? 3 : 1) : -(calibrating ? Math.ceil(points / 2) : points);
        const shadow = legacyStrength.get(playerId);
        const oldStart = shadow.rating;
        shadow.rating += adjustment(oldChange);
        const mappedEnd = currentRating(shadow.rating);
        player.rating = !seenV2 ? mappedEnd : Math.max(0, startingRating + (legacy ? mappedEnd - currentRating(oldStart) : adjustment(change)));
        if (trackAward) {
          const gain = player.rating - startingRating;
          player.monthly.set(month, (player.monthly.get(month) ?? 0) + gain);
        }
        player.games++;
        if (won) player.wins++;
        else player.losses++;
        const after = tierOf(player.rating);
        if (before !== after) player.history.push({ date: match.finishedAt, from: before, to: after });
      }
    });
  }
  return strength;
}

const label = player => player.nickname ? player.name + ' (' + player.nickname + ')' : player.name;
const byName = (left, right) => label(left).localeCompare(label(right), 'id');
const activeIds = session => new Set(session.matches.filter(match => match.status === 'active').flatMap(match => match.teams.flat()));
const queuedIds = session => new Set(session.matches.filter(match => match.status === 'queued').flatMap(match => match.teams.flat()));
const courtQueue = (session, court) => session.matches.filter(match => match.court === court && match.status === 'queued');
const playerReady = (club, session, playerId) => session.attendance[playerId]?.status === 'ready' && club.players.some(player => player.id === playerId && !player.archived);
const canStart = (club, session, match) => {
  const active = activeIds(session);
  return match.teams.flat().every(playerId => !active.has(playerId) && playerReady(club, session, playerId));
};
function startMatch(match, now) {
  match.status = 'active';
  match.startedAt = now.toISOString();
}
function shuffle(items, pick) {
  for (let index = items.length - 1; index > 0; index--) {
    const other = pick(index + 1);
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

export function suggest(club, session, locked) {
  return suggestOptions(club, session, locked)[0];
}

export function suggestOptions(club, session, locked, pick = randomInt) {
  requireRule(Array.isArray(locked) && locked.length === 4, 'Pilih empat slot pemain.');
  const busy = activeIds(session);
  const queued = queuedIds(session);
  const pins = locked.filter(Boolean);
  const available = club.players.filter(player => !player.archived && session.attendance[player.id]?.status === 'ready' && !busy.has(player.id) && !queued.has(player.id));
  requireRule(new Set(pins).size === pins.length && pins.every(playerId => available.some(player => player.id === playerId)), 'Pemain yang dipilih sedang tidak tersedia.');
  requireRule(available.length >= 4, 'Butuh empat pemain siap main yang belum terjadwal.');
  const strength = standings(club);
  const played = session.matches.filter(m => ['finished','unscored'].includes(m.status)).sort((a,b) => a.finishOrder - b.finishOrder);
  const games = new Map(), partners = new Map(), opponents = new Map();
  const add = (map, key, weight) => map.set(key, (map.get(key) || 0) + weight);
  const pair = (a,b) => a < b ? a + ':' + b : b + ':' + a;
  for (const m of played) for (const id of m.teams.flat()) add(games, id, 1);
  played.slice(-8).forEach(({teams:[a,b]}, i) => {
    for (const t of [a,b]) add(partners, pair(...t), i+1);
    for (const x of a) for (const y of b) add(opponents, pair(x,y), i+1);
  });
  const since = id => Date.parse(session.attendance[id].since);
  const first = Math.min(...available.map(p => since(p.id)));
  const group = id => Math.floor((since(id)-first)/120000);
  const priority = (a,b) => group(a)-group(b) || (games.get(a)||0)-(games.get(b)||0);
  const pool = available.map(p=>p.id).filter(id=>!pins.includes(id)).sort((a,b)=>priority(a,b) || a.localeCompare(b));
  const needed = 4-pins.length;
  if (!needed) return [[locked.slice(0,2),locked.slice(2)]];
  const cutoff = pool[needed-1];
  const fixed = [...pins,...pool.filter(id=>priority(id,cutoff)<0)];
  const tied = shuffle(pool.filter(id => priority(id, cutoff) === 0), pick).slice(0, 16);
  const candidates = [];
  function evaluate(ids) {
    for (let mate=1; mate<4; mate++) {
      const a=[ids[0],ids[mate]], b=ids.filter((_,i)=>i!==0 && i!==mate);
      const oriented = [[a,b],[b,a]].find(sides=>locked.every((id,i)=>!id || sides[i>>1].includes(id)));
      if (!oriented) continue;
      const teams=oriented.map((team,i)=>{
        const slots=locked.slice(2*i,2*i+2), free=team.filter(id=>!slots.includes(id));
        return slots.map(id=>id || free.shift());
      });
      const gap=Math.abs(teamAverage(a,strength)-teamAverage(b,strength));
      const partnersCost=(partners.get(pair(...a))||0)+(partners.get(pair(...b))||0);
      let opponentsCost=0;
      for(const x of a) for(const y of b) opponentsCost+=opponents.get(pair(x,y))||0;
      candidates.push({teams,gap,partnersCost,opponentsCost});
    }
  }
  function choose(start,ids) {
    if(ids.length===4) return evaluate(ids);
    for(let i=start;i<=tied.length-(4-ids.length);i++) choose(i+1,[...ids,tied[i]]);
  }
  choose(0,fixed);
  // Allow some rating difference when choosing varied lineups.
  const tolerance = 250;
  const bestGap=Math.min(...candidates.map(c=>c.gap));
  const competitive = shuffle(candidates.filter(c => c.gap <= bestGap + tolerance), pick);
  const shown = new Map(), options = [];
  while (competitive.length && options.length < 5) {
    // Break comparable options in favor of players not already previewed.
    const exposure = c => c.teams.flat().reduce((n,id) => n + (shown.get(id) || 0), 0);
    for (const c of competitive) c.exposure = exposure(c);
    const gapBand = candidate => Math.floor((candidate.gap - bestGap) / 50);
    competitive.sort((a,b) => a.partnersCost - b.partnersCost || a.opponentsCost - b.opponentsCost || gapBand(a) - gapBand(b) || a.exposure - b.exposure);
    const {teams} = competitive.shift();
    options.push(teams);
    for (const id of teams.flat()) add(shown,id,1);
  }
  return options;
}

function validateName(input, required) {
  requireRule(typeof input === 'string', 'Nama tidak valid.');
  const name = input.trim().replace(/\s+/gu, ' ').normalize('NFC');
  requireRule((!required || name.length >= 2) && name.length <= (required ? 100 : 50) && !/[\p{Cc}\p{Cf}]/u.test(name), 'Periksa panjang dan isi nama pemain.');
  return name;
}

export function applyHost(club, data, now, host) {
  const { action } = data;
  if (action === 'addPlayer' || action === 'editPlayer') {
    const name = validateName(data.name, true);
    const nickname = validateName(data.nickname ?? '', false);
    const initialTier = data.initialTier ?? null;
    const gender = data.gender ?? null;
    requireRule(gender === null || ['pria', 'wanita'].includes(gender), 'Pilihan gender tidak valid.');
    requireRule(initialTier === null || legacyStartingRatings.has(initialTier), 'Pilihan tier awal tidak valid.');
    const display = label({ name, nickname }).toLocaleLowerCase('id');
    requireRule(!club.players.some(player => player.id !== data.playerId && label(player).toLocaleLowerCase('id') === display), 'Nama tampilan ini sudah ada.', 409);
    if (action === 'addPlayer') {
      requireRule(club.players.length < 1000, 'Roster penuh.');
      club.players.push({ id: id(), name, nickname, initialTier, gender, archived: false });
    } else {
      const player = club.players.find(item => item.id === data.playerId);
      requireRule(player, 'Pemain tidak ditemukan.', 404);
      if (data.initialTier !== undefined && initialTier !== (player.initialTier ?? null)) {
        const hasOfficialScore = allMatches(club).some(match => match.score && match.teams.flat().includes(player.id));
        requireRule(!hasOfficialScore, 'Tier awal terkunci setelah skor resmi pertama.', 409);
        player.initialTier = initialTier;
      }
      Object.assign(player, { name, nickname });
      if (data.gender !== undefined) player.gender = gender;
    }
    return;
  }
  if (action === 'archivePlayer') {
    const player = club.players.find(item => item.id === data.playerId);
    requireRule(player, 'Pemain tidak ditemukan.', 404);
    requireRule(typeof data.archived === 'boolean', 'Pilih status pemain.');
    const session = club.sessions.find(item => !item.closed);
    if (data.archived && session) {
      requireRule(!activeIds(session).has(player.id) && !queuedIds(session).has(player.id), 'Selesaikan atau batalkan laga pemain ini dulu.', 409);
      if (session.attendance[player.id]) session.attendance[player.id].status = 'left';
    }
    player.archived = data.archived;
    return;
  }
  if (action === 'removeSignup') {
    requireRule(data.date === signupTuesday(club, now), 'Daftar sesi sudah berganti.', 409);
    club.signups[data.date] = (club.signups[data.date] ?? []).filter(playerId => playerId !== data.playerId);
    return;
  }
  if (action === 'openSession') {
    requireRule(!club.sessions.some(session => !session.closed), 'Tutup sesi sebelumnya dulu.', 409);
    const date = validateSessionDate(club, data.date === undefined ? nextTuesday(club, now) : data.date, now);
    const courts = data.courts === undefined ? courtPlan(club, date).courts : data.courts;
    requireRule(Number.isInteger(courts) && courts >= 1 && courts <= maxCourts, 'Isi jumlah lapangan antara 1 dan ' + maxCourts + '.');
    club.sessions.push({ id: id(), date, courts, closed: false, attendance: {}, matches: [] });
    return;
  }

  const session = club.sessions.find(item => item.id === data.sessionId);
  requireRule(session, 'Sesi tidak ditemukan.', 404);
  if (action === 'deleteMatch') {
    const index = session.matches.findIndex(item => item.id === data.matchId);
    const match = session.matches[index];
    requireRule(match && ['finished', 'unscored'].includes(match.status), 'Hanya laga selesai yang masih tercatat yang bisa dihapus.', 409);
    requireRule(match.revision === data.revision, 'Data berubah di perangkat lain. Muat ulang lalu coba lagi.', 409);
    session.matches.splice(index, 1);
    return;
  }
  if (action === 'score' || action === 'deleteScore') {
    const match = session.matches.find(item => item.id === data.matchId);
    requireRule(match && ['finished', 'unscored'].includes(match.status), 'Hasil hanya bisa dicatat setelah laga selesai.', 409);
    requireRule(match.revision === data.revision, 'Data berubah di perangkat lain. Muat ulang lalu coba lagi.', 409);
    if (action === 'deleteScore') {
      requireRule(Boolean(match.score), 'Tidak ada skor resmi yang bisa dihapus.', 409);
      match.audit.push({ previous: match.score, score: null, at: now.toISOString(), host });
      match.score = null;
      match.scoreDeleted = true;
    } else {
      requireRule(validScore(data.score), 'Isi dua skor bulat yang berbeda, mulai dari 0.');
      if (!match.score || match.score.some((points, index) => points !== data.score[index])) {
        match.audit.push({ previous: match.score, score: data.score, at: now.toISOString(), host });
        match.score = data.score;
        delete match.scoreDeleted;
      }
      match.status = 'finished';
    }
    match.revision++;
    return;
  }

  requireRule(!session.closed, 'Sesi sudah ditutup.', 409);
  if (action === 'activateCourt' || action === 'deactivateCourt') {
    const court = data.court;
    requireRule(Number.isInteger(court) && court >= 1 && court <= maxCourts, 'Pilih nomor lapangan antara 1 dan ' + maxCourts + '.');
    const current = activeCourts(session);
    if (action === 'activateCourt') {
      requireRule(!current.includes(court), 'Lapangan ini sudah aktif.', 409);
      session.activeCourts = [...current, court].sort((a,b) => a-b);
    } else {
      requireRule(current.includes(court), 'Lapangan ini sudah nonaktif.', 409);
      requireRule(!session.matches.some(m => m.court === court && ['active','queued'].includes(m.status)), 'Selesaikan atau batalkan laga di lapangan ini dulu.', 409);
      session.activeCourts = current.filter(n => n !== court);
    }
    session.courts = session.activeCourts.length;
    return;
  }
  if (action === 'rescheduleSession') {
    requireRule(!session.matches.some(match => match.startedAt), 'Tanggal terkunci setelah pertandingan pertama dimulai.', 409);
    session.date = validateSessionDate(club, data.date, now, session.id);
    return;
  }
  if (action === 'closeSession') {
    requireRule(!session.matches.some(match => match.status === 'active'), 'Selesaikan atau batalkan pertandingan aktif dulu.', 409);
    const stamp = now.toISOString();
    session.closed = true;
    session.closedAt = stamp;
    for (const match of session.matches) {
      if (match.status === 'queued') match.status = 'cancelled';
      if (match.status === 'finished' && !match.score) match.status = 'unscored';
    }
    return;
  }
  if (action === 'attendance' || action === 'bulkAttendance') {
    const ids = action === 'attendance' ? [data.playerId] : data.playerIds;
    requireRule(Array.isArray(ids) && ids.length > 0 && ids.length <= 1000 &&
      ids.every(playerId => typeof playerId === 'string') && new Set(ids).size === ids.length, 'Pilih pemain yang valid.');
    const activePlayers = new Set(club.players.filter(player => !player.archived).map(player => player.id));
    requireRule(ids.every(playerId => activePlayers.has(playerId)), 'Pemain aktif tidak ditemukan.', 404);
    requireRule(['ready', 'rest', 'left', 'absent'].includes(data.status), 'Status kehadiran tidak valid.');
    const since = now.toISOString();
    for (const playerId of ids) {
      if (session.attendance[playerId]?.status === data.status) continue;
      if (data.status === 'absent') delete session.attendance[playerId];
      else session.attendance[playerId] = { status: data.status, since };
    }
    return;
  }
  if (action === 'createMatch' || action === 'editQueuedMatch') {
    const editing = action === 'editQueuedMatch';
    const match = editing ? session.matches.find(item => item.id === data.matchId) : null;
    if (editing) {
      requireRule(match?.status === 'queued', 'Hanya laga yang masih antre yang bisa diedit.', 409);
      requireRule(match.revision === data.revision, 'Data berubah di perangkat lain. Muat ulang lalu coba lagi.', 409);
    }
    const court = match?.court ?? data.court;
    requireRule(activeCourts(session).includes(court), 'Lapangan tidak valid.');
    const { teams } = data;
    requireRule(Array.isArray(teams) && teams.length === 2 && teams.every(team => Array.isArray(team) && team.length === 2), 'Isi dua pemain untuk setiap tim.');
    const players = teams.flat();
    const active = activeIds(session);
    const current = new Set(match?.teams.flat());
    const reserved = new Set(session.matches.filter(item => item !== match && item.status === 'queued').flatMap(item => item.teams.flat()));
    requireRule(new Set(players).size === 4 && players.every(playerId => !active.has(playerId) && !reserved.has(playerId) &&
      (current.has(playerId) || playerReady(club, session, playerId))), 'Pemain pengganti harus siap dan belum terjadwal.', 409);
    if (match) {
      match.teams = teams;
      match.revision++;
    } else {
      requireRule(courtQueue(session, court).length < 2, 'Antrean lapangan penuh (maksimal 2 laga).', 409);
      session.matches.push({ id: id(), court, teams, status: 'queued', score: null, audit: [], revision: 0 });
    }
    return;
  }

  const match = session.matches.find(item => item.id === data.matchId);
  requireRule(match, 'Pertandingan tidak ditemukan.', 404);
  if (action === 'startMatch') {
    requireRule(match.status === 'queued', 'Pertandingan sudah berjalan atau selesai.', 409);
    requireRule(!session.matches.some(item => item.court === match.court && item.status === 'active'), 'Lapangan masih dipakai.', 409);
    requireRule(courtQueue(session, match.court)[0] === match, 'Mulai antrean pertama atau batalkan dulu.', 409);
    requireRule(canStart(club, session, match), 'Ada pemain yang sedang main atau belum siap.', 409);
    startMatch(match, now);
    return;
  }
  if (action === 'finishMatch') {
    requireRule(match.status === 'active', 'Pertandingan belum berjalan atau sudah selesai.', 409);
    match.status = 'finished';
    match.finishedAt = now.toISOString();
    match.finishOrder = ++club.sequence;
    match.ratingVersion = 2;
    for (const playerId of match.teams.flat()) {
      if (playerReady(club, session, playerId)) session.attendance[playerId].since = match.finishedAt;
    }
    const next = courtQueue(session, match.court)[0];
    if (next && canStart(club, session, next)) startMatch(next, now);
    return;
  }
  if (action === 'cancelMatch') {
    requireRule(['queued', 'active', 'finished', 'unscored'].includes(match.status) && !match.score, 'Pertandingan dengan skor resmi tidak bisa dibatalkan.', 409);
    match.status = 'cancelled';
    return;
  }
  throw new RuleError('Tindakan tidak dikenal.');
}

export function addSignup(club, data, now) {
  const date = signupTuesday(club, now);
  requireRule(data.date === date, 'Daftar sesi sudah berganti. Muat ulang halaman.', 409);
  requireRule(club.players.some(player => player.id === data.playerId && !player.archived), 'Pilih nama yang ada di roster.');
  const listed = club.signups[date] ??= [];
  if (!listed.includes(data.playerId)) listed.push(data.playerId);
}

export function clubView(club, now, host = false) {
  const currentMonth = day(now).slice(0, 7);
  const previousMonth = moveDay(currentMonth + '-01', -1).slice(0, 7);
  const awardMonths = host ? [] : [currentMonth, previousMonth];
  const strength = standings(club, awardMonths);
  const roster = club.players.slice().sort(byName).map(player => {
    const stats = strength.get(player.id);
    return {
      id: player.id, name: player.name, nickname: player.nickname, display: label(player), archived: player.archived,
      tier: tierOf(stats.rating), calibration: stats.usesCalibration ? Math.min(5, stats.games) : null, games: stats.games,
      wins: stats.wins, losses: stats.losses, history: stats.history,
      ...(host ? { initialTier: player.initialTier ?? null, gender: player.gender ?? null } : {}),
    };
  });
  const active = roster.filter(player => !player.archived);
  const rankByTier = {};
  const ranked = active.slice().sort((left, right) => strength.get(right.id).rating - strength.get(left.id).rating || byName(left, right))
    .map(player => ({ ...player, rank: rankByTier[player.tier] = (rankByTier[player.tier] ?? 0) + 1 }));
  const signup = courtPlan(club, signupTuesday(club, now));
  const sessionPlan = host ? courtPlan(club, nextTuesday(club, now)) : undefined;
  return {
    players: host ? roster : ranked,
    ...(host ? {} : { monthlyMvp: awardMonths.map(month => ({
      month, winners: mvpWinners(roster.map(player => ({name:player.display, gain:strength.get(player.id).monthly.get(month) ?? 0}))),
    })) }),
    ...(sessionPlan ? { sessionDate: sessionPlan.date, sessionMinDate: day(now), suggestedSessionCourts: sessionPlan.courts } : {}),
    signup,
    sessions: club.sessions.slice().reverse().map(session => ({
      id: session.id, date: session.date, courts: session.courts, activeCourts: activeCourts(session), closed: session.closed,
      present: Object.values(session.attendance).filter(record => record.status !== 'absent').length,
      ...(host ? {
        attendance: session.attendance, registered: club.signups[session.date] ?? [],
        canReschedule: !session.closed && !session.matches.some(match => match.startedAt),
      } : {}),
      matches: session.matches.filter(match => host || !match.scoreDeleted).map(match => ({
        id: match.id, court: match.court, status: match.status, finishedAt: match.finishedAt,
        teams: match.teams.map(team => team.map(playerId => {
          const player = roster.find(item => item.id === playerId);
          return { id: player.id, display: player.display, tier: player.tier };
        })),
        score: match.score,
        ...(host ? { scoreDeleted: Boolean(match.scoreDeleted), revision: match.revision, audit: match.audit } : {}),
      })),
    })),
  };
}
