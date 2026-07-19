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
import { AnimatePresence } from 'framer-motion';
import { supabase } from './supabase';

// Defaults lifted from 00_parameters.R
const defaultGameSettings = {
  code: '',
  maxPoints: 5000,
  rounds: 3,
  locationsPerRound: 5,
  roundMinutes: 15,
  dc: { at_large: 50, downtown: 15, greater_central: 25, metro: 10, metro_distance: 150 },
  nyc: { manhattan: 43, brooklyn: 32, queens: 12, bronx: 3, subway: 10, subway_distance: 100 },
};

// No lookalike characters, nobody squinting at a phone confusing 0 and O
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

const REVEAL_DELAY_MS = 5000; // "Round over!" breather before the reveal

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDC, setCity] = useState(true);
  const [gameSettings, setGameSettings] = useState(defaultGameSettings);
  const [game, setGame] = useState(null); // the games row you joined
  const [adminGame, setAdminGame] = useState(null); // the games row created from the admin panel
  const [locations, setLocations] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [team, setTeam] = useState(null); // { id, name, photo }
  const [role, setRole] = useState(null); // 'guessr' | 'mappr'
  const [player, setPlayer] = useState({ tag: '' }); // how you show up in the lobby
  const [localStarted, setLocalStarted] = useState(false); // covers no-supabase mode
  const [now, setNow] = useState(Date.now());

  // shared clock tick, everything time-based hangs off this
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  // Grab every round's locations once the game is going
  useEffect(() => {
    if (!supabase || !game?.id || !gameStarted) return;
    supabase.from('locations')
      .select('round,seq,lat,lng,heading').eq('game_id', game.id)
      .order('round').order('seq')
      .then(({ data }) => setLocations(data || []));
  }, [game?.id, gameStarted]);

  const roundLocations = locations.filter(l => l.round === currentRound);

  const joinGame = (g) => {
    setGame(g);
    if (g.city) setCity(g.city === 'DC');
  };

  const createGame = async () => {
    if (!supabase) return;
    const code = (gameSettings.code || genCode()).toUpperCase();
    const { data } = await supabase.from('games')
      .insert({ code, city: isDC ? 'DC' : 'NYC', settings: gameSettings, status: 'lobby' })
      .select().single();
    if (data) {
      setAdminGame(data);
      setGameSettings({ ...gameSettings, code: data.code });
    }
  };

  const startGame = async () => {
    if (supabase && adminGame) {
      const { data } = await supabase.from('games')
        .update({ status: 'active', current_round: 1, round_started_at: new Date().toISOString() })
        .eq('id', adminGame.id).select().single();
      if (data) setAdminGame(data);
    }
    setLocalStarted(true); // no-supabase mode
  };

  const nextRound = async () => {
    if (!supabase || !adminGame) return;
    const { data } = await supabase.from('games')
      .update({
        current_round: (adminGame.current_round || 1) + 1,
        round_started_at: new Date().toISOString(),
      })
      .eq('id', adminGame.id).select().single();
    if (data) setAdminGame(data);
  };

  const finishGame = async () => {
    if (!supabase || !adminGame) return;
    const { data } = await supabase.from('games')
      .update({ status: 'finished' }).eq('id', adminGame.id).select().single();
    if (data) setAdminGame(data);
  };

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
              onStartGame = {startGame}
              onNextRound = {nextRound}
              onFinishGame = {finishGame} />
      <AnimatePresence>
      </AnimatePresence>
      <main>
        {!game && (
          <GameCodeEntry activeCode={activeCode} onJoin={joinGame} />
        )}
        {game && !role && (
          <TeamSetup game={game}
                     teamName={teamName}
                     setTeamName={setTeamName}
                     onReady={(t, r) => { setTeam(t); setRole(r); }} />
        )}
        {role && (
          <div className="team-chip">
            {team.photo && <img src={team.photo} alt="team" />}
            <span>Team {team.name}</span>
          </div>
        )}
        {role && !gameStarted && (
          <Lobby role={role} team={team} player={player} setPlayer={setPlayer} game={game} />
        )}
        {role && gameOver && (
          <Results game={game} locations={locations} />
        )}
        {role && gameStarted && !gameOver && phase === 'roundover' && (
          <div className="round-over">
            <h2>Round over!</h2>
            <p className="team-hint">Let's see how everyone did</p>
          </div>
        )}
        {role && gameStarted && !gameOver && phase === 'reveal' && (
          <RoundReveal game={game} locations={locations} isDC={isDC} />
        )}
        {role === 'guessr' && gameStarted && !gameOver && phase === 'guessing' && (
          <GuessrView game={game} team={team} roundLocations={roundLocations} deadline={deadline} now={now} />
        )}
        {role === 'mappr' && gameStarted && !gameOver && phase === 'guessing' && (
          <MapprView roundLocations={roundLocations} isDC={isDC} currentRound={currentRound} />
        )}
      </main>
    </div>
  );
}

export default App;
