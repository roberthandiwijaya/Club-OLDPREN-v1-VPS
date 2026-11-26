import assert from 'node:assert/strict';
import test from 'node:test';
import { applyHost, clubView, day, newClub, nextTuesday, RuleError, standings, suggest, validScore } from '../domain.mjs';

const monday = new Date('2026-11-23T16:59:59Z');
const tuesday = new Date('2026-11-23T17:00:00Z');
const wednesday = new Date('2026-11-24T17:00:00Z');
const sessionDate = '2026-11-24';
const isConflict = error => error instanceof RuleError && error.status === 409;

function queuedMatch() {
  const club = newClub();
  const players = ['Ayu', 'Bima', 'Citra', 'Dimas'];
  const match = { id: 'laga-1', court: 1, teams: [players.slice(0, 2), players.slice(2)], status: 'queued', score: null };
  const session = {
    id: 'sesi-1', date: sessionDate, courts: 1, closed: false, matches: [match],
    attendance: Object.fromEntries(players.map(id => [id, { status: 'ready', since: monday.toISOString() }])),
  };
  club.players = players.map(name => ({ id: name, name, archived: false }));
  club.sessions.push(session);
  return { club, session, match };
}

test('skor menerima dua angka bulat berbeda dan menolak hasil tanpa pemenang', () => {
  const accepted = [[0, 1], [11, 7], [20, 18], [21, 20], [30, 27], [42, 40]];
  const rejected = [
    null, [21], [21, 19, 0], [21, '19'], [21, -1], [21, 18.5],
    [0, 0], [29, 29], [Number.MAX_SAFE_INTEGER + 1, 0],
  ];
  for (const score of accepted) assert.equal(validScore(score), true, JSON.stringify(score));
  for (const score of rejected) assert.equal(validScore(score), false, JSON.stringify(score));
});

test('skala baru membedakan lawan setara, unggulan dan kejutan sesuai selisih skor', () => {
  for (const [tierA, tierB, score, expected] of [
    ['F', 'F', [21, 19], 16],
    ['SS', 'F', [21, 19], 2],
    ['SS', 'F', [21, 9], 8],
    ['F', 'SS', [21, 19], 24],
    ['F', 'SS', [21, 9], 30],
  ]) {
    const { club, match } = queuedMatch();
    club.players.forEach((player, index) => { player.initialTier = index < 2 ? tierA : tierB; });
    const before = standings(club);
    Object.assign(match, { score, finishOrder: 1, ratingVersion: 2 });
    const after = standings(club);
    assert.equal(after.get('Ayu').rating - before.get('Ayu').rating, expected);
    assert.equal(after.get('Citra').rating - before.get('Citra').rating, -expected);
  }
});

test('MVP menghitung kenaikan bersih dari tanggal selesai WIB dan berubah saat skor dikoreksi', () => {
  const { club, session, match } = queuedMatch();
  Object.assign(match, { score: [21, 9], finishOrder: 1, finishedAt: '2026-11-30T16:59:59Z' });
  const now = new Date('2026-12-02T03:00:00Z');
  const initial = clubView(club, now);
  assert.equal(initial.players.find(player => player.id === 'Ayu').tier, 'E');
  assert.deepEqual(initial.monthlyMvp, [
    { month: '2026-12', winners: [] },
    { month: '2026-11', winners: ['Ayu', 'Bima'] },
  ]);
  const next = { ...match, id: 'laga-2', score: [9, 21], finishOrder: 2, finishedAt: '2026-11-30T17:00:00Z', ratingVersion: 2 };
  session.matches.push(next);
  assert.deepEqual(clubView(club, now).monthlyMvp[0].winners, ['Citra', 'Dimas']);
  next.score = [21, 9];
  assert.deepEqual(clubView(club, now).monthlyMvp[0].winners, ['Ayu', 'Bima']);
  next.score = null;
  assert.deepEqual(clubView(club, now).monthlyMvp, initial.monthlyMvp);
});

test('tanggal berganti tepat tengah malam WIB dan Selasa yang sudah ditutup dilewati', () => {
  const club = newClub();
  assert.equal(day(monday), '2026-11-23');
  assert.equal(day(tuesday), sessionDate);
  assert.equal(nextTuesday(club, monday), sessionDate);
  assert.equal(nextTuesday(club, tuesday), sessionDate);
  assert.equal(nextTuesday(club, tuesday, false), '2026-12-01');
  club.sessions.push({ date: sessionDate, closed: true }, { date: '2026-12-01', closed: true });
  assert.equal(nextTuesday(club, tuesday), '2026-12-08');
});

test('laga bisa dimulai sebelum atau sesudah tanggal sesi yang masih terbuka', () => {
  for (const startTime of [monday, wednesday]) {
    const { club, session, match } = queuedMatch();
    applyHost(club, { action: 'startMatch', sessionId: session.id, matchId: match.id }, startTime, 'host');
    assert.equal(match.status, 'active');
    assert.equal(match.startedAt, startTime.toISOString());
  }
});

test('laga yang pemainnya belum siap atau sesinya sudah tutup tidak bisa dimulai', () => {
  const { club, session, match } = queuedMatch();
  const action = { action: 'startMatch', sessionId: session.id, matchId: match.id };
  session.attendance.Ayu.status = 'rest';
  assert.throws(() => applyHost(club, action, monday, 'host'), isConflict);
  assert.equal(match.status, 'queued');
  assert.equal(match.startedAt, undefined);

  session.attendance.Ayu.status = 'ready';
  session.closed = true;
  assert.throws(() => applyHost(club, action, monday, 'host'), isConflict);
  assert.equal(match.status, 'queued');
  assert.equal(match.startedAt, undefined);
});

test('host bisa membatalkan laga yang masih antre, sedangkan laga berskor resmi terkunci', () => {
  const { club, session, match } = queuedMatch();
  const action = { action: 'cancelMatch', sessionId: session.id, matchId: match.id };
  applyHost(club, action, monday, 'host');
  assert.equal(match.status, 'cancelled');

  const scored = { ...match, id: 'laga-resmi', status: 'finished', score: [21, 15] };
  session.matches.push(scored);
  assert.throws(() => applyHost(club, { ...action, matchId: scored.id }, tuesday, 'host'), isConflict);
  assert.equal(scored.status, 'finished');
  assert.deepEqual(scored.score, [21, 15]);
});

test('saran tim memberi pasangan baru untuk pemain dengan tier dan waktu tunggu yang sama', () => {
  const { club, session, match } = queuedMatch();
  match.status = 'finished';
  const teams = suggest(club, session, [null, null, null, null]);
  assert.deepEqual(teams.map(team => team.length), [2, 2]);
  assert.deepEqual(new Set(teams.flat()), new Set(match.teams.flat()));
  for (const priorTeam of match.teams) {
    assert.ok(teams.every(team => !priorTeam.every(playerId => team.includes(playerId))));
  }
});
