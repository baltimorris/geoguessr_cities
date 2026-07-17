import React, { useState } from 'react';
import './App.css';
import MapView from './components/MapView';
import Header from './components/Header';
import GameCodeEntry from './components/GameCodeEntry';
import TeamSetup from './components/TeamSetup';
import Lobby from './components/Lobby';
import StreetView from './components/StreetView';
import { AnimatePresence } from 'framer-motion';

// Defaults lifted from 00_parameters.R
const defaultGameSettings = {
  code: '',
  maxPoints: 5000,
  dc: { at_large: 50, downtown: 15, greater_central: 25, metro: 10, metro_distance: 150 },
  nyc: { manhattan: 43, brooklyn: 32, queens: 12, bronx: 3, subway: 10, subway_distance: 100 },
};

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDC, setCity] = useState(true);
  const [gameSettings, setGameSettings] = useState(defaultGameSettings);
  const [joinedCode, setJoinedCode] = useState(null);
  const [teamName, setTeamName] = useState('');
  const [team, setTeam] = useState(null); // { name, photo }
  const [role, setRole] = useState(null); // 'guessr' | 'mappr'
  const [player, setPlayer] = useState({ tag: '' }); // how you show up in the lobby
  const [gameStarted, setGameStarted] = useState(false); // runner flips this, backend eventually

  // Until there's a backend, the joinable code is whatever admin set (or DEMO)
  const activeCode = gameSettings.code || 'DEMO';

  // Players shouldn't be poking at settings once they've named a team
  const hideSettings = teamName.trim().length > 0;

  return (
    <div className="app-container">
      <Header settingsOpen={settingsOpen && !hideSettings}
              setSettingsOpen={setSettingsOpen}
              isDC = {isDC}
              setCity = {setCity}
              gameSettings = {gameSettings}
              setGameSettings = {setGameSettings}
              hideSettings = {hideSettings}
              onStartGame = {() => setGameStarted(true)} />
      <AnimatePresence>
      </AnimatePresence>
      <main>
        {!joinedCode && (
          <GameCodeEntry activeCode={activeCode} onJoin={setJoinedCode} />
        )}
        {joinedCode && !role && (
          <TeamSetup gameCode={joinedCode}
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
