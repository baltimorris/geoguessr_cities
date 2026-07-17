import React, { useState } from 'react';
import './App.css';
import MapView from './components/MapView';
import Header from './components/Header';
import { AnimatePresence } from 'framer-motion';
import Button from '@mui/material/Button';

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDC, setCity] = useState(true);
  const [role, setRole] = useState(null); // null until a player picks viewr or guessr

  return (
    <div className="app-container">
      <Header settingsOpen={settingsOpen}
              setSettingsOpen={setSettingsOpen}
              isDC = {isDC}
              setCity = {setCity} />
      <AnimatePresence>
      </AnimatePresence>
      <main>
        {role === null && (
          <>
            <Button variant='contained' size='large' onClick={() => setRole('viewr')}>I'm the Viewr</Button>
            <br/>
            <Button variant='contained' size='large' onClick={() => setRole('guessr')}>I'm the Guessr</Button>
          </>
        )}
        {role === 'guessr' && (
          <div className="map-container">
            <MapView isDC={isDC} />
          </div>
        )}
        {role === 'viewr' && (
          <p>Street view goes here</p>
        )}
      </main>
    </div>
  );
}

export default App;
