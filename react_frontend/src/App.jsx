import React, { useState } from 'react';
import './App.css';
import MapView from './MapView';
import Header from './Header';
import SettingsPanel from './SettingsPanel';
import { AnimatePresence } from 'framer-motion';

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="app-container">
      <Header settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen} />
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
