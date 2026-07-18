import React, { useState, useEffect } from 'react';
import './App.css';
import MapView from './components/MapView';
import Header from './components/Header';
import GameCodeEntry from './components/GameCodeEntry';
import TeamSetup from './components/TeamSetup';
import Lobby from './components/Lobby';
import StreetView from './components/StreetView';
import { AnimatePresence } from 'framer-motion';
import { supabase } from './supabase';

// Defaults lifted from 00_parameters.R
const defaultGameSettings = {
  code: '',
  maxPoints: 5000,
  dc: { at_large: 50, downtown: 15, greater_central: 25, metro: 10, metro_distance: 150 },
  nyc: { manhattan: 43, brooklyn: 32, queens: 12, bronx: 3, subway: 10, subway_distance: 100 },
};

// No lookalike characters, nobody squinting at a phone confusing 0 and O
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDC, setCity] = useState(true);
  const [gameSettings, setGameSettings] = useState(defaultGameSettings);
  const [game, setGame] = useState(null); // the games row you joined
  const [adminGame, setAdminGame] = useState(null); // the games row created from the admin panel
  const [teamName, setTeamName] = useState('');
  const [team, setTeam] = useState(null); // { id, name, photo }
  const [role, setRole] = useState(null); // 'guessr' | 'mappr'
  const [player, setPlayer] = useState({ tag: '' }); // how you show up in the lobby
  const [gameStarted, setGameStarted] = useState(false);

  // Local-only fallback code when supabase env vars aren't set
  const activeCode = gameSettings.code || 'DEMO';

  // Players shouldn't be poking at settings once they've named a team
  const hideSettings = teamName.trim().length > 0;

  // Watch the joined game so everyone flips over the moment the runner hits start
  useEffect(() => {
    if (!supabase || !game?.id) return;
    if (game.status === 'active') {
      setGameStarted(true);
      return;
    }
    const channel = supabase.channel(`game-${game.id}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${game.id}` },
        payload => { if (payload.new.status === 'active') setGameStarted(true); })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [game?.id, game?.status]);

  const joinGame = (g) => {
    setGame(g);
    if (g.city) setCity(g.city === 'DC');
    if (g.status === 'active') setGameStarted(true);
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
      await supabase.from('games').update({ status: 'active' }).eq('id', adminGame.id);
    }
    setGameStarted(true); // covers local-only mode and the runner's own device
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
              onStartGame = {startGame} />
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
            <span>{team.name}</span>
          </div>
        )}
        {role && !gameStarted && (
          <Lobby role={role} team={team} player={player} setPlayer={setPlayer} />
        )}
        {role === 'guessr' && gameStarted && (
          <div className="map-container">
            <MapView isDC={isDC} />
          </div>
        )}
        {role === 'mappr' && gameStarted && (
          <StreetView isDC={isDC} />
        )}
      </main>
    </div>
  );
}

export default App;
