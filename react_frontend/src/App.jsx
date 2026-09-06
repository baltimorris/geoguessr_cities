import React, { useState, useEffect } from 'react';
import './App.css';
import Header from './components/Header';
import GameCodeEntry from './components/GameCodeEntry';
import TeamSetup from './components/TeamSetup';
import Lobby from './components/Lobby';
import GuessrView from './components/GuessrView';
import MapprView from './components/MapprView';
import RoundReveal from './components/RoundReveal';
import Results from './components/Results';
import { motion } from 'framer-motion';
import { supabase } from './supabase';
import { generateLocations } from './generateLocations';
import { mergeTeams } from './scoring';

// Defaults lifted from 00_parameters.R
const defaultGameSettings = {
  code: '',
  maxPoints: 5000,
  rounds: 3,
  locationsPerRound: 5,
  roundMinutes: 15,
  maxTeamSize: 5,
  handicap: true, // scale scores down for bigger teams
  dc: { at_large: 50, downtown: 15, greater_central: 25, metro: 10, metro_distance: 150 },
  nyc: { manhattan: 43, brooklyn: 32, queens: 12, bronx: 3, subway: 10, subway_distance: 100 },
};

// No lookalike characters, nobody squinting at a phone confusing 0 and O
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

const REVEAL_DELAY_MS = 5000; // "Round over!" breather before the reveal

// so a refresh (or a phone locking) doesn't kick you out of the game
const SESSION_KEY = 'lg_session';
const ADMIN_GAME_KEY = 'lg_admin_game';

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDC, setCity] = useState(true);
  const [gameSettings, setGameSettings] = useState(defaultGameSettings);
  const [game, setGame] = useState(null); // the games row you joined
  const [adminGame, setAdminGame] = useState(null); // the games row created from the admin panel
  const [adminLocations, setAdminLocations] = useState([]); // so the runner knows if a round is loaded
  const [adminError, setAdminError] = useState('');
  const [revealTotal, setRevealTotal] = useState(null); // how many reveal steps this round has, so the remote knows when to stop offering "Reveal next"
  const [generating, setGenerating] = useState(false);
  const [locations, setLocations] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [team, setTeam] = useState(null); // { id, name, photo }
  const [role, setRole] = useState(null); // 'guessr' | 'mappr'
  const [player, setPlayer] = useState({ tag: '' }); // how you show up in the lobby
  const [localStarted, setLocalStarted] = useState(false); // covers no-supabase mode
  const [now, setNow] = useState(Date.now());
  const [restoring, setRestoring] = useState(true);

  // shared clock tick, everything time-based hangs off this
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Put a player back in their seat after a refresh
  useEffect(() => {
    if (!supabase) { setRestoring(false); return; }
    let saved;
    try { saved = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { saved = null; }
    if (!saved?.gameId) { setRestoring(false); return; }
    (async () => {
      const { data: g } = await supabase.from('games').select().eq('id', saved.gameId).maybeSingle();
      if (g) {
        setGame(g);
        setCity((g.city || 'DC') === 'DC');
        if (saved.team) { setTeam(saved.team); setTeamName(saved.team.name); }
        if (saved.role) setRole(saved.role);
        if (saved.player) setPlayer(saved.player);
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
      setRestoring(false);
    })();
  }, []);

  // and keep that seat up to date
  useEffect(() => {
    if (!game?.id || !team || !role) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ gameId: game.id, team, role, player }));
  }, [game?.id, team, role, player]);

  // Same idea for the runner, so a reload doesn't strand a game mid-round
  useEffect(() => {
    if (!supabase) return;
    const id = localStorage.getItem(ADMIN_GAME_KEY);
    if (!id) return;
    supabase.from('games').select().eq('id', id).maybeSingle()
      .then(({ data }) => {
        if (data) setAdminGame(data);
        else localStorage.removeItem(ADMIN_GAME_KEY);
      });
  }, []);

  const leaveGame = () => {
    // free up the guessr seat so a teammate can pick it up - otherwise a team
    // whose guessr's phone dies or who taps "not you?" is stuck guessr-less
    // for the rest of the game, since nothing else ever clears this flag.
    if (supabase && role === 'guessr' && team?.id) {
      supabase.from('teams').update({ guessr_claimed: false }).eq('id', team.id).then(() => {});
    }
    localStorage.removeItem(SESSION_KEY);
    setGame(null);
    setTeam(null);
    setRole(null);
    setTeamName('');
    setPlayer({ tag: '' });
    setLocalStarted(false);
  };

  // Once a game is finished, let players see the final scores briefly, then boot
  // them back to a clean code-entry screen so nobody lingers on a stale board.
  useEffect(() => {
    if (!role || game?.status !== 'finished') return;
    const t = setTimeout(leaveGame, 30000);
    return () => clearTimeout(t);
  }, [role, game?.status]);

  // Until there's a backend, the joinable code is whatever admin set (or DEMO)
  const activeCode = gameSettings.code || 'DEMO';

  // Players shouldn't be poking at settings once they've named a team
  const hideSettings = teamName.trim().length > 0;

  const gameStarted = localStarted || game?.status === 'active' || game?.status === 'finished';
  const gameOver = game?.status === 'finished';
  const currentRound = game?.current_round || 1;
  const roundMinutes = game?.settings?.roundMinutes ?? 15;

  // The deadline lives in the db (round_started_at), so every phone agrees on it
  const deadline = game?.round_started_at
    ? new Date(game.round_started_at).getTime() + roundMinutes * 60000
    : null;

  let phase = 'guessing';
  if (gameStarted && !gameOver && deadline) {
    if (now >= deadline + REVEAL_DELAY_MS) phase = 'reveal';
    else if (now >= deadline) phase = 'roundover';
  }

  // Follow the joined game live: start, next round, finish all arrive here
  useEffect(() => {
    if (!supabase || !game?.id) return;
    const channel = supabase.channel(`game-${game.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
        payload => setGame(prev => ({ ...prev, ...payload.new })))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [game?.id]);

  // Grab the round's locations once the game is going, but keep answer coordinates
  // away from the guessr while they're guessing (their client would otherwise hold
  // the exact answers). The guessr only needs the seq numbers for their chips.
  // Mapprs get coordinates for the current round only, so they can't pre-read
  // future rounds' answers either.
  useEffect(() => {
    // wait for a role: before that they're on the team screen and need no locations,
    // and role === null would otherwise slip past the guessr coordinate guard
    if (!supabase || !game?.id || !gameStarted || !role) return;
    const guessing = !gameOver && phase === 'guessing';
    const wantCoords = !(role === 'guessr' && guessing);
    const cols = wantCoords ? 'round,seq,lat,lng,heading' : 'round,seq';
    let q = supabase.from('locations').select(cols).eq('game_id', game.id);
    if (role === 'mappr' && guessing) q = q.eq('round', currentRound);
    q.order('round').order('seq').then(({ data }) => setLocations(data || []));
  }, [game?.id, gameStarted, role, phase, gameOver, currentRound]);

  // the runner needs to know whether 07_upload_round.R has run for this game
  useEffect(() => {
    if (!supabase || !adminGame?.id) return;
    supabase.from('locations')
      .select('round,seq').eq('game_id', adminGame.id)
      .then(({ data }) => setAdminLocations(data || []));
  }, [adminGame?.id, adminGame?.status, adminGame?.current_round]);

  const roundLocations = locations.filter(l => l.round === currentRound);

  // the runner's own clock for the game they created, so the panel can show reveal controls
  const adminDeadline = adminGame?.round_started_at
    ? new Date(adminGame.round_started_at).getTime() + (adminGame.settings?.roundMinutes ?? 15) * 60000
    : null;
  const adminRoundOver = adminGame?.status === 'active' && adminDeadline !== null && now >= adminDeadline;

  // How many reveal frames the current round actually has (one per location,
  // plus one more per team that guessed there) - the remote uses this to know
  // when "Reveal next" has nothing left to reveal, same tally RoundReveal
  // does for players, so the runner's control never outpaces or lags theirs.
  useEffect(() => {
    if (!supabase || !adminGame?.id || adminGame.status !== 'active') { setRevealTotal(null); return; }
    let cancelled = false;
    (async () => {
      const { data: teams } = await supabase.from('teams').select('id,name,size').eq('game_id', adminGame.id);
      const ids = (teams || []).map(t => t.id);
      const { data: guesses } = ids.length
        ? await supabase.from('guesses').select('team_id,location').eq('round', adminGame.current_round).in('team_id', ids)
        : { data: [] };
      if (cancelled) return;
      const merged = mergeTeams(teams || []);
      const locsThisRound = adminLocations.filter(l => l.round === adminGame.current_round);
      const total = locsThisRound.reduce((sum, loc) => {
        const n = merged.filter(t => t.ids.some(id => (guesses || []).some(g => g.team_id === id && g.location === loc.seq))).length;
        return sum + Math.max(1, n);
      }, 0);
      setRevealTotal(total);
    })();
    return () => { cancelled = true; };
  }, [adminGame?.id, adminGame?.status, adminGame?.current_round, adminRoundOver, adminLocations]);

  const joinGame = (g) => {
    setGame(g);
    if (g.city) setCity(g.city === 'DC');
  };

  const createGame = async () => {
    if (!supabase) return;
    setAdminError('');
    const code = (gameSettings.code || genCode()).toUpperCase();
    const { data, error } = await supabase.from('games')
      .insert({ code, city: isDC ? 'DC' : 'NYC', settings: gameSettings, status: 'lobby' })
      .select().single();
    if (error) {
      // the partial unique index only trips while another game with that code is live
      setAdminError(error.code === '23505'
        ? `Code ${code} is already running a game. Finish it or pick another.`
        : "Couldn't create the game, try again");
      return;
    }
    setAdminGame(data);
    setAdminLocations([]);
    setGameSettings({ ...gameSettings, code: data.code });
    localStorage.setItem(ADMIN_GAME_KEY, data.id);
  };

  // Every remote-control tap below used to silently do nothing on a flaky bar
  // wifi connection (data was read but error never checked) - this surfaces
  // a message instead so the runner isn't left guessing whether a tap landed.
  const runAdminAction = async (updates, failMsg) => {
    const { data, error } = await supabase.from('games')
      .update(updates).eq('id', adminGame.id).select().single();
    if (error) { setAdminError(failMsg); return; }
    setAdminError('');
    setAdminGame(data);
  };

  const startGame = async () => {
    if (supabase && adminGame) {
      await runAdminAction(
        { status: 'active', current_round: 1, round_started_at: new Date().toISOString() },
        "Couldn't start the game, try again"
      );
    }
    setLocalStarted(true); // no-supabase mode
  };

  // Quick way to fill a game without running the R pipeline, handy for testing
  const seedLocations = async () => {
    if (!supabase || !adminGame) return;
    setAdminError('');
    setGenerating(true);
    try {
      // the game's own settings win, the form may have been reset by a reload
      const rounds = adminGame.settings?.rounds ?? gameSettings.rounds ?? 3;
      const perRound = adminGame.settings?.locationsPerRound ?? gameSettings.locationsPerRound ?? 5;
      const spots = await generateLocations({
        apiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
        city: adminGame.city,
        rounds,
        perRound,
        settings: adminGame.settings ?? gameSettings,
      });
      if (!spots.length) throw new Error('no street view spots came back');
      const { error } = await supabase.from('locations')
        .insert(spots.map(({ area, ...s }) => ({ ...s, game_id: adminGame.id })));
      if (error) throw error;
      setAdminLocations(spots);
      // a bucket with sparse Street View coverage can quietly come up short
      // instead of failing outright, so say so rather than leave a round thin
      const expected = rounds * perRound;
      setAdminError(spots.length < expected
        ? `Only found ${spots.length} of ${expected} spots — some areas may have thin Street View coverage. Try again or adjust the weights.`
        : '');
    } catch (e) {
      setAdminError(e.message || "Couldn't generate locations");
    }
    setGenerating(false);
  };

  // Ends the round for everyone right now by pushing the deadline into the past,
  // which trips the same "Round over" -> reveal path the timer uses
  const endRound = async () => {
    if (!supabase || !adminGame) return;
    const mins = adminGame.settings?.roundMinutes ?? 15;
    await runAdminAction(
      { round_started_at: new Date(Date.now() - mins * 60000).toISOString(), reveal_step: 0 },
      "Couldn't end the round, try again"
    );
  };

  // Admin drives the reveal by hand now, one bump per team/location
  const revealNext = async () => {
    if (!supabase || !adminGame) return;
    await runAdminAction(
      { reveal_step: (adminGame.reveal_step || 0) + 1 },
      "Couldn't advance the reveal, try again"
    );
  };

  // undoes an accidental (or "let me show that again") tap of Reveal next
  const revealBack = async () => {
    if (!supabase || !adminGame) return;
    await runAdminAction(
      { reveal_step: Math.max(0, (adminGame.reveal_step || 0) - 1) },
      "Couldn't go back, try again"
    );
  };

  const nextRound = async () => {
    if (!supabase || !adminGame) return;
    await runAdminAction(
      {
        current_round: (adminGame.current_round || 1) + 1,
        round_started_at: new Date().toISOString(),
        reveal_step: 0,
      },
      "Couldn't start the next round, try again"
    );
  };

  const finishGame = async () => {
    if (!supabase || !adminGame) return;
    await runAdminAction({ status: 'finished' }, "Couldn't finish the game, try again");
  };

  // wipe the slate: finish the current game (which boots every player) and drop
  // back to the setup panel for a fresh one
  const newGame = async () => {
    if (supabase && adminGame && adminGame.status !== 'finished') {
      const { error } = await supabase.from('games').update({ status: 'finished' }).eq('id', adminGame.id);
      // if this failed, the game's still live server-side - don't drop the
      // panel back to setup and orphan it with nobody driving anymore
      if (error) { setAdminError("Couldn't reset, try again"); return; }
    }
    setAdminGame(null);
    setAdminLocations([]);
    setAdminError('');
    localStorage.removeItem(ADMIN_GAME_KEY);
  };

  // one screen at a time, keyed so framer-motion can cross-fade between them
  let screenKey = 'code';
  let screen = <GameCodeEntry activeCode={activeCode} onJoin={joinGame} />;
  if (restoring) {
    screenKey = 'restoring';
    screen = <p className="team-hint">Reconnecting...</p>;
  } else if (game && !role) {
    screenKey = 'team';
    screen = <TeamSetup game={game} teamName={teamName} setTeamName={setTeamName}
                        onReady={(t, r) => { setTeam(t); setRole(r); }} />;
  } else if (role && !gameStarted) {
    screenKey = 'lobby';
    screen = <Lobby role={role} team={team} player={player} setPlayer={setPlayer} game={game} />;
  } else if (role && gameOver) {
    screenKey = 'results';
    screen = <Results game={game} locations={locations} />;
  } else if (role && gameStarted && phase === 'roundover') {
    screenKey = 'roundover';
    screen = (
      <div className="round-over">
        <h2>Round over!</h2>
        <p className="team-hint">Let's see how everyone did</p>
      </div>
    );
  } else if (role && gameStarted && phase === 'reveal') {
    screenKey = 'reveal';
    screen = <RoundReveal game={game} locations={locations} isDC={isDC} />;
  } else if (role === 'guessr' && gameStarted) {
    screenKey = 'guessr';
    screen = <GuessrView game={game} team={team} roundLocations={roundLocations} deadline={deadline} now={now} />;
  } else if (role === 'mappr' && gameStarted) {
    screenKey = 'mappr';
    screen = <MapprView roundLocations={roundLocations} isDC={isDC} currentRound={currentRound} />;
  }

  return (
    <div className="app-container">
      <Header settingsOpen={settingsOpen && !hideSettings}
              setSettingsOpen={setSettingsOpen}
              isDC = {isDC}
              setCity = {setCity}
              gameSettings = {gameSettings}
              setGameSettings = {setGameSettings}
              hideSettings = {hideSettings}
              adminGame = {adminGame}
              onCreateGame = {createGame}
              onNewGame = {newGame}
              onStartGame = {startGame}
              onEndRound = {endRound}
              onRevealNext = {revealNext}
              onRevealBack = {revealBack}
              onNextRound = {nextRound}
              onFinishGame = {finishGame}
              onSeedLocations = {seedLocations}
              generating = {generating}
              adminError = {adminError}
              adminRoundOver = {adminRoundOver}
              adminLocationCount = {adminLocations.length}
              revealTotal = {revealTotal}
              team = {team}
              role = {role}
              onLeaveGame = {leaveGame} />
      <main>
        {/* keyed so it re-mounts and slides in on each screen change. opacity stays 1
            the whole time so a stalled animation engine can never hide the game. */}
        <motion.div
          key={screenKey}
          className={`screen ${['mappr', 'lobby'].includes(screenKey) ? 'screen-full' : ''}`}
          initial={{ y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          {screen}
        </motion.div>
      </main>
    </div>
  );
}

export default App;
