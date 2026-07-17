import React, { useState } from 'react';
import './App.css';
import MapView from './components/MapView';
import Header from './components/Header';
import GameCodeEntry from './components/GameCodeEntry';
import TeamSetup from './components/TeamSetup';
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
  const [team, setTeam] = useState(null); // { name, photo }
  const [role, setRole] = useState(null); // 'guessr' | 'mappr'

  // Until there's a backend, the joinable code is whatever admin set (or DEMO)
  const activeCode = gameSettings.code || 'DEMO';

  return (
    <div className="app-container">
      <Header settingsOpen={settingsOpen}
              setSettingsOpen={setSettingsOpen}
              isDC = {isDC}
              setCity = {setCity}
              gameSettings = {gameSettings}
              setGameSettings = {setGameSettings} />
      <AnimatePresence>
      </AnimatePresence>
      <main>
        {!joinedCode && (
          <GameCodeEntry activeCode={activeCode} onJoin={setJoinedCode} />
        )}
        {joinedCode && !role && (
          <TeamSetup gameCode={joinedCode}
                     onReady={(t, r) => { setTeam(t); setRole(r); }} />
        )}
        {role && (
          <div className="team-chip">
            {team.photo && <img src={team.photo} alt="team" />}
            <span>{team.name}</span>
          </div>
        )}
        {role === 'guessr' && (
          <div className="map-container">
            <MapView isDC={isDC} />
          </div>
        )}
        {role === 'mappr' && (
          <p>Street view goes here</p>
        )}
      </main>
    </div>
  );
}

export default App;
