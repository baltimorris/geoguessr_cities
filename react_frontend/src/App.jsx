import React, { useState } from 'react';
import './App.css';
import MapView from './components/MapView';
import Header from './components/Header';
import SettingsPanel from './components/SettingsPanel';
import { AnimatePresence } from 'framer-motion';
import Button from '@mui/material/Button';

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDC, setCity] = useState(true);
  const [role, setRole] = useState(true);

  return (
    <div className="app-container">
      <Header settingsOpen={settingsOpen} 
              setSettingsOpen={setSettingsOpen}
              isDC = {isDC}
              setCity = {setCity} />
      <AnimatePresence>
      </AnimatePresence>
      <main>
        <Button variant='contained' size='large'>I'm the Guessr</Button>
        <br/>
        <Button variant='contained' size='large'>I'm a Mappr</Button>
      </main>
    </div>
  );
}

export default App;
