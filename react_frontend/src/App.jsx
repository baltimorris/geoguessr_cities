import React, { useState } from 'react';
import './App.css';
import MapView from './components/MapView';
import Header from './components/Header';
import SettingsPanel from './components/SettingsPanel';
import { AnimatePresence } from 'framer-motion';

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDC, setCity] = useState(true);

  return (
    <div className="app-container">
      <Header settingsOpen={settingsOpen} 
              setSettingsOpen={setSettingsOpen}
              isDC = {isDC}
              setCity = {setCity} />
      <AnimatePresence>
      </AnimatePresence>
      <main>
        <div className="map-container">
          <MapView />
        </div>
      </main>
    </div>
  );
}

export default App;
