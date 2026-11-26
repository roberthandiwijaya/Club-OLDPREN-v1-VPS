import test from 'node:test';
import assert from 'node:assert/strict';
import { newClub, suggestOptions } from '../domain.mjs';

const time = '2026-11-24T10:00:00Z';
function fixture(n) {
  const club = newClub();
  const session = {attendance:{}, matches:[]};
  club.sessions.push(session);
  const ids = Array.from({length:n}, (_,i)=>`p${String(i).padStart(4,'0')}`);
  for (const id of ids) {
    club.players.push({id,name:id,initialTier:'F'});
    session.attendance[id] = {status:'ready',since:time};
  }
  return {club,session,ids,options:(pins=Array(4).fill(null), pick=()=>0)=>suggestOptions(club,session,pins,pick)};
}
const key = teams => teams.map(team=>team.slice().sort().join(':')).sort().join('/');

test('four equals offer three truly distinct splits; pins keep their exact seat',()=>{
  const f=fixture(4);
  assert.equal(new Set(f.options().map(key)).size,3);
  for(const teams of f.options([null,f.ids[0],null,null])) assert.equal(teams[0][1],f.ids[0]);
  assert.deepEqual(f.options(f.ids),[[f.ids.slice(0,2),f.ids.slice(2)]]);
  f.club.players[0].initialTier='SS'; f.club.players[1].initialTier='SS';
  assert.equal(f.options().length,2);
  assert.ok(f.options().every(teams=>teams.every(team=>team.filter(id=>f.ids.slice(0,2).includes(id)).length===1)));
});
test('longer wait wins, then fewer completed games; no busy or unavailable players',()=>{
  const f=fixture(15), {ids,session}=f;
  session.matches.push({teams:[ids.slice(0,2),ids.slice(2,4)],status:'unscored',finishOrder:1},
    {teams:[ids.slice(6,8),ids.slice(8,10)],status:'active'}, {teams:[ids.slice(10,12),[ids[12],ids[13]]],status:'queued'});
  session.attendance[ids[0]].since='2026-11-24T09:55:00Z'; session.attendance[ids[1]].status='rest'; f.club.players[2].archived=true;
  for(const teams of f.options()) assert.deepEqual(new Set(teams.flat()),new Set([ids[0],ids[4],ids[5],ids[14]]));
});
test('partner and opponent scoring is independent of team and player order',()=>{
  const f=fixture(4);const [a,b,c,d]=f.ids;
  f.session.matches.push({teams:[[a,b],[c,d]],status:'finished',finishOrder:1},{teams:[[a,c],[b,d]],status:'unscored',finishOrder:2});
  const prior=f.options().map(key); assert.equal(prior[0],key([[a,d],[b,c]]));
  for(const m of f.session.matches) m.teams.reverse().forEach(team=>team.reverse());
  assert.deepEqual(f.options().map(key),prior);
});
test('a large tied roster samples beyond the front of the queue and rotates previews',()=>{
  const f=fixture(1000);const options=f.options(undefined, max => Math.floor(max / 2));assert.equal(options.length,5);
  assert.ok(options[0].flat().some(id=>f.ids.indexOf(id)>16));
  assert.equal(new Set([...options[0].flat(),...options[1].flat()]).size,8);
});

test('pilihan pertama bisa berganti di antara pemain dengan giliran dan kekuatan yang sama', () => {
  const f = fixture(24);
  const pins = [f.ids[0], null, null, null];
  const first = f.options(pins, () => 0)[0];
  const second = f.options(pins, max => max - 1)[0];
  assert.equal(first[0][0], f.ids[0]);
  assert.equal(second[0][0], f.ids[0]);
  assert.notDeepEqual(new Set(first.flat()), new Set(second.flat()));
});
