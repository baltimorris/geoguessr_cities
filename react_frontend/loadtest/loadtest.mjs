// loadtest.mjs - simulates a full game with lots of phones against the real
// Supabase project, to find what breaks (and what eats the free-tier limits)
// before a real event does. Run it by hand, never in CI:
//
//   LT_ADMIN_EMAIL=... LT_ADMIN_PW=... node loadtest/loadtest.mjs --teams 40 --perTeam 3 --presence global
//
// Every simulated phone is its own Supabase client with its own websocket,
// like a real phone. It mimics what the app does: join a team, sit in the
// lobby presence channel, follow the game row over realtime, fetch locations,
// insert guesses, and run the reveal queries when a round ends. The game it
// creates has the code LOAD; delete it afterwards (see loadtest/README.md).
//
// Needs a temporary admin account (the game rows are admin-only now).
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import regions from '../src/data/regions.json' with { type: 'json' };
import { PRACTICE_LOCATIONS } from '../src/practiceLocations.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---- args + env -------------------------------------------------------------
const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const TEAMS = Number(arg('teams', 20));
const PER_TEAM = Number(arg('perTeam', 3));
const PRESENCE = arg('presence', 'global'); // 'global' = today's lobby, 'team' = one channel per team
const JOIN_SECS = Number(arg('joinSecs', 30));
const GUESS_SECS = Number(arg('guessSecs', 20));
const ROUNDS_TO_RUN = Number(arg('rounds', 1)); // real rounds after practice
const REVEAL_MODE = arg('reveal', 'views'); // 'views' = today's 3 queries per phone (x2: the effect re-runs), 'rpc' = one reveal_data call
const POLL = arg('poll', '1') === '1';   // the app's fallback: poll the game row while the realtime socket is down
const STEP_GAP = Number(arg('stepGapMs', 700)); // gap between the admin's reveal taps
const CODE = 'LOAD';

const env = Object.fromEntries(
  fs.readFileSync(path.join(here, '../.env.local'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
);
const URL_ = env.VITE_SUPABASE_URL, KEY = env.VITE_SUPABASE_ANON_KEY;
if (!URL_ || !KEY) throw new Error('missing supabase env');
if (!process.env.LT_ADMIN_EMAIL || !process.env.LT_ADMIN_PW) throw new Error('set LT_ADMIN_EMAIL and LT_ADMIN_PW');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// ---- metrics ----------------------------------------------------------------
const lat = {};          // name -> [ms]
const errors = {};       // message -> count
const status = {};       // realtime channel status -> count
const rec = (name, ms) => (lat[name] ||= []).push(ms);
const err = (where, e) => { const k = `${where}: ${e?.message || e?.code || String(e)}`.slice(0, 120); errors[k] = (errors[k] || 0) + 1; };
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]); };
const timed = async (name, fn) => {
  const t = Date.now();
  try {
    const r = await fn();
    if (r?.error) { err(name, r.error); return r; }
    rec(name, Date.now() - t);
    return r;
  } catch (e) { err(name, e); return { error: e }; }
};

// ---- fake locations ----------------------------------------------------------
const ring = regions.DC.polygons.at_large;
const inRing = (lng, lat, r) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
const randomPoint = () => {
  const lngs = ring.map(p => p[0]), lats = ring.map(p => p[1]);
  for (;;) {
    const lng = Math.min(...lngs) + Math.random() * (Math.max(...lngs) - Math.min(...lngs));
    const lat = Math.min(...lats) + Math.random() * (Math.max(...lats) - Math.min(...lats));
    if (inRing(lng, lat, ring)) return { lat, lng };
  }
};

// ---- a simulated phone -------------------------------------------------------
const phones = [];
let game = null;
const gameUpdates = new Map(); // phone -> last payload (to await fan-out)

class Phone {
  constructor(teamName, role) {
    this.teamName = teamName; this.role = role;
    this.sb = mk(); this.team = null; this.members = 0; this.sizeWritten = 0;
    this.lastRecv = null; this.seenSteps = new Set(); this.locs = [];
  }
  async join() {
    if (this.role === 'guessr') {
      let r = await timed('team.insert', () => this.sb.from('teams').insert({ game_id: game.id, name: this.teamName, emoji: '🍺' }).select().single());
      this.team = r.data;
      if (this.team) await timed('team.claim', () => this.sb.from('teams').update({ guessr_claimed: true }).eq('id', this.team.id));
    } else {
      // viewrs arrive after their guessr; same lookup TeamSetup does
      for (let i = 0; i < 10 && !this.team; i++) {
        const r = await timed('team.lookup', () => this.sb.from('teams').select('*').eq('game_id', game.id).ilike('name', this.teamName).limit(1));
        this.team = r.data?.[0] || null;
        if (!this.team) await sleep(500);
      }
    }
    if (!this.team) return;
    this.joinLobby();
    this.followGame();
  }
  joinLobby() {
    const chanName = PRESENCE === 'team'
      ? `lobby-${game.id}-${encodeURIComponent(this.teamName.toLowerCase())}`
      : `lobby-${game.id}`;
    const key = Math.random().toString(36).slice(2);
    const ch = this.sb.channel(chanName, { config: { presence: { key } } });
    const refresh = () => {
      const state = ch.presenceState();
      const everyone = Object.values(state).map(m => m[m.length - 1]);
      const n = everyone.filter(m => (m.team || '').toLowerCase() === this.teamName.toLowerCase()).length;
      if (n !== this.members) {
        this.members = n;
        // same write Lobby.jsx does whenever the headcount changes
        // the real Lobby only does this while the game is still in the lobby
        const started = this.lastRecv && this.lastRecv.status !== 'lobby';
        if (n >= 1 && !started) { this.sizeWritten++; this.sb.from('teams').update({ size: Math.min(n, 5) }).eq('id', this.team.id).then(r => r.error && err('lobby.size', r.error)); }
      }
    };
    const t0 = Date.now();
    ch.on('presence', { event: 'sync' }, refresh).on('presence', { event: 'join' }, refresh).on('presence', { event: 'leave' }, refresh)
      .subscribe(s => {
        status[`lobby:${s}`] = (status[`lobby:${s}`] || 0) + 1;
        if (s === 'SUBSCRIBED') { rec('lobby.subscribe', Date.now() - t0); ch.track({ team: this.teamName, role: this.role, tag: '' }); }
      });
    this.lobby = ch;
  }
  followGame() {
    const t0 = Date.now();
    this.gameCh = this.sb.channel(`game-${game.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` }, p => {
        const recvAt = Date.now();
        this.lastRecv = p.new;
        const commit = Date.parse(p.commit_timestamp);
        if (commit) rec('game.update.fanout', recvAt - commit);
        this.seenSteps.add(`${p.new.current_round}:${p.new.status}:${p.new.reveal_step}:${p.new.round_started_at}`);
      })
      .subscribe(s => {
        status[`game:${s}`] = (status[`game:${s}`] || 0) + 1;
        if (s === 'SUBSCRIBED') { rec('game.subscribe', Date.now() - t0); this.stopPoll(); }
        else if (POLL) this.startPoll();
      });
  }
  // same idea as App.jsx: while the socket isn't up, read the game row every 4s
  startPoll() {
    if (this.pollId) return;
    this.pollId = setInterval(async () => {
      const t = Date.now();
      const { data, error } = await this.sb.from('games').select().eq('id', game.id).maybeSingle();
      if (error) { err('poll', error); return; }
      rec('poll.latency', Date.now() - t);
      if (data) { this.polled = (this.polled || 0) + 1; this.lastRecv = data; }
    }, 4000);
  }
  stopPoll() { if (this.pollId) { clearInterval(this.pollId); this.pollId = null; } }
  async fetchLocations(round) {
    // guessr: no coordinates while guessing; viewr: coordinates for the current round only
    const q = this.sb.from('locations').select(this.role === 'guessr' ? 'round,seq' : 'round,seq,lat,lng,heading').eq('game_id', game.id).eq('round', round);
    const r = await timed(`locations.fetch.${this.role}`, () => q);
    this.locs = r.data || [];
    return this.locs.length;
  }
  async guess(round, perLoc) {
    if (this.role !== 'guessr') return;
    for (let seq = 1; seq <= perLoc; seq++) {
      await sleep(Math.random() * (GUESS_SECS * 1000) / perLoc);
      const p = randomPoint();
      await timed('guess.insert', () => this.sb.from('guesses').insert({ team_id: this.team.id, round, location: seq, lat: p.lat, lng: p.lng }));
      if (Math.random() < 0.2) { // changed their mind
        const q = randomPoint();
        await timed('guess.insert', () => this.sb.from('guesses').insert({ team_id: this.team.id, round, location: seq, lat: q.lat, lng: q.lng }));
      }
    }
  }
  async revealQueries(round) {
    if (REVEAL_MODE === 'rpc') {
      await timed('reveal.rpc', () => this.sb.rpc('reveal_data', { p_game: game.id, p_round: round }));
      return;
    }
    // what RoundReveal runs when a round's reveal starts - and it runs it twice
    // today, because the locations array is refetched right after it mounts
    await this.revealViews(round);
    await sleep(300 + Math.random() * 700);
    await this.revealViews(round);
  }
  async revealViews(round) {
    await Promise.all([
      timed('reveal.teams', () => this.sb.from('teams').select('name,size').eq('game_id', game.id)),
      timed('reveal.guess_scores', () => this.sb.from('guess_scores').select('team_name,team_emoji,scored_team_size,round,location_seq,guess_lat,guess_lng,distance_ft,points').eq('game_id', game.id).eq('is_latest', true)),
      timed('reveal.round_scores', () => this.sb.from('team_round_scores').select('team_name,round,round_points,running_total').eq('game_id', game.id).lte('round', round)),
    ]);
  }
  async finalQueries() {
    if (REVEAL_MODE === 'rpc') {
      await timed('results.rpc', () => this.sb.rpc('results_data', { p_game: game.id }));
      return;
    }
    await Promise.all([
      timed('results.teams', () => this.sb.from('teams').select('name,size').eq('game_id', game.id)),
      timed('results.totals', () => this.sb.from('team_total_scores').select('team_name,total_points').eq('game_id', game.id)),
    ]);
  }
  async close() { this.stopPoll(); try { await this.sb.removeAllChannels(); } catch { /* already closed */ } }
}

// ---- the run ------------------------------------------------------------------
const admin = mk();
const adminUpdate = async (name, updates) => {
  const t = Date.now();
  const { data, error } = await admin.from('games').update(updates).eq('id', game.id).select().single();
  if (error) { err(name, error); return null; }
  rec(name, Date.now() - t);
  game = data;
  return data;
};
// wait until every phone's last realtime payload satisfies `pred` (or timeout), report who missed it
const waitAll = async (label, pred, timeoutMs = 15000) => {
  const t = Date.now();
  while (Date.now() - t < timeoutMs) {
    if (phones.every(p => p.lastRecv && pred(p.lastRecv))) { rec(`${label}.allReceived`, Date.now() - t); return 0; }
    await sleep(100);
  }
  const missed = phones.filter(p => !(p.lastRecv && pred(p.lastRecv))).length;
  err(`${label}.missedUpdate`, `${missed}/${phones.length} phones never got it`);
  return missed;
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  log(`config: ${TEAMS} teams x ${PER_TEAM} phones = ${TEAMS * PER_TEAM} websockets, presence=${PRESENCE}`);
  const { error: authErr } = await admin.auth.signInWithPassword({ email: process.env.LT_ADMIN_EMAIL, password: process.env.LT_ADMIN_PW });
  if (authErr) throw authErr;

  // leftovers from a crashed run
  const { data: old } = await admin.from('games').select('id').eq('code', CODE).neq('status', 'finished');
  if (old?.length) await admin.from('games').update({ status: 'finished' }).in('id', old.map(g => g.id));

  const settings = { rounds: 3, locationsPerRound: 5, roundMinutes: 15, practice: true, practiceMinutes: 4, maxTeamSize: 5, handicap: true, maxPoints: 5000 };
  const { data: g, error: gErr } = await admin.from('games').insert({ code: CODE, city: 'DC', settings, status: 'lobby' }).select().single();
  if (gErr) throw gErr;
  game = g;
  const rows = [
    ...PRACTICE_LOCATIONS.DC.map(s => ({ ...s, round: 0, game_id: game.id })),
    ...[1, 2, 3].flatMap(round => [1, 2, 3, 4, 5].map(seq => ({ round, seq, ...randomPoint(), game_id: game.id }))),
  ];
  const { error: lErr } = await admin.from('locations').insert(rows);
  if (lErr) throw lErr;
  log(`game ${CODE} created with ${rows.length} locations`);

  // 1. join storm -------------------------------------------------------------
  const t0 = Date.now();
  const joiners = [];
  for (let t = 0; t < TEAMS; t++) {
    const name = `Team ${String(t + 1).padStart(3, '0')}`;
    // teammates show up around the same time, the guessr first (a viewr who
    // arrives first would just create the team, same end result)
    const base = Math.random() * JOIN_SECS * 1000;
    for (let k = 0; k < PER_TEAM; k++) {
      const p = new Phone(name, k === 0 ? 'guessr' : 'viewr');
      phones.push(p);
      const delay = base + (k === 0 ? 0 : 1500 + Math.random() * 5000);
      joiners.push(sleep(delay).then(() => p.join()));
    }
  }
  await Promise.all(joiners);
  log(`all ${phones.length} phones joined in ${Math.round((Date.now() - t0) / 1000)}s; letting presence settle`);
  await sleep(10000);
  const right = phones.filter(p => p.members === PER_TEAM).length;
  const { data: sizes } = await admin.from('teams').select('size').eq('game_id', game.id);
  const sizeOk = (sizes || []).filter(s => s.size === PER_TEAM).length;
  log(`lobby: ${right}/${phones.length} phones see their full team; ${sizeOk}/${TEAMS} team rows have the right size; ${phones.reduce((s, p) => s + p.sizeWritten, 0)} size writes`);

  // 2. start (practice round) ---------------------------------------------------
  await adminUpdate('admin.start', { status: 'active', current_round: 0, round_started_at: new Date().toISOString() });
  await waitAll('start', r => r.status === 'active');
  const got = await Promise.all(phones.map(p => p.fetchLocations(0)));
  log(`start: locations fetched, rows per phone min=${Math.min(...got)} max=${Math.max(...got)} (3 expected)`);

  const playRound = async (round, perLoc) => {
    log(`round ${round}: guessing`);
    await Promise.all(phones.map(p => p.guess(round, perLoc)));
    // end round now (what "End round now" does)
    const past = new Date(Date.now() - 20 * 60000).toISOString();
    await adminUpdate('admin.endRound', { round_started_at: past, reveal_step: 0 });
    await waitAll(`end.r${round}`, r => Date.parse(r.round_started_at) < Date.now() - 60000);
    await sleep(5000 + Math.random() * 500); // the app's "Round over!" breather
    const t = Date.now();
    await Promise.all(phones.map(p => p.revealQueries(round)));
    log(`round ${round}: ${phones.length} phones ran the reveal queries in ${Date.now() - t}ms`);
    // admin steps through the reveal
    const steps = 12;
    for (let s = 1; s <= steps; s++) {
      await adminUpdate('admin.revealNext', { reveal_step: s });
      await sleep(STEP_GAP);
    }
    await waitAll(`reveal.r${round}`, r => r.reveal_step === steps);
  };

  await playRound(0, 3);
  for (let r = 1; r <= ROUNDS_TO_RUN; r++) {
    await adminUpdate('admin.nextRound', { current_round: r, round_started_at: new Date().toISOString(), reveal_step: 0 });
    await waitAll(`next.r${r}`, x => x.current_round === r && x.reveal_step === 0);
    await Promise.all(phones.map(p => p.fetchLocations(r)));
    await playRound(r, 5);
  }

  // 3. finish --------------------------------------------------------------------
  await adminUpdate('admin.finish', { status: 'finished' });
  await waitAll('finish', r => r.status === 'finished');
  const t1 = Date.now();
  await Promise.all(phones.map(p => p.finalQueries()));
  log(`results: ${phones.length} phones loaded results in ${Date.now() - t1}ms`);
}

const report = () => {
  console.log('\n===== RESULTS =====');
  console.log(`phones=${phones.length} presence=${PRESENCE}`);
  console.log('\nlatency ms (n / p50 / p95 / max):');
  for (const [k, v] of Object.entries(lat).sort()) console.log(`  ${k.padEnd(28)} ${String(v.length).padStart(5)} ${String(pct(v, .5)).padStart(6)} ${String(pct(v, .95)).padStart(6)} ${String(Math.max(...v)).padStart(6)}`);
  console.log('\nrealtime channel statuses:', JSON.stringify(status));
  console.log(`phones that fell back to polling at some point: ${phones.filter(p => p.polled).length}`);
  console.log('\nerrors:', Object.keys(errors).length ? '' : 'none');
  for (const [k, n] of Object.entries(errors).sort((a, b) => b[1] - a[1])) console.log(`  ${n}x ${k}`);
};

main().catch(e => { console.error('RUN FAILED:', e); process.exitCode = 1; })
  .finally(async () => {
    report();
    await Promise.all(phones.map(p => p.close()));
    await admin.removeAllChannels();
    process.exit(process.exitCode || 0);
  });
