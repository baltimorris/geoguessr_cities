import React from 'react';
import './App.css'; // Make sure your styles are imported
import MapView from './MapView';
import { motion } from 'framer-motion';
import { useState } from 'react';
import {AnimatePresence } from 'framer-motion';
import { FaCog } from 'react-icons/fa'
const barClasses = ['RD', 'OR', 'YL', 'GR', 'BL', 'SV'];

function App() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="app-container">
      <motion.header
        className="header"
        animate={{ height: settingsOpen ? '500vh' : 150 }}
        transition={{ duration: 0.4, ease: 'easeInOut' }}
      >
        <div className="bars-container">
          {barClasses.map((cls, i) => (
            <motion.div
              key={cls}
              className={cls}
              initial={{ height: 0 }}
              animate={{ height: '100%' }}
              transition={{ delay: i * 0.1, duration: 0.4, ease: 'easeOut' }}
            />
          ))}
        </div>

        {/* Fixed Header Text */}
        <div className="header-text-container">
          <div className="dc-float">DC</div>
          <div className="header-text">LocalGuessr</div>
        </div>

        {/* Gear Button */}
        <button className="settings-button" onClick={() => setSettingsOpen(prev => !prev)}>
          <FaCog />
        </button>

        {/* Sliding Settings Content */}
        {settingsOpen && (
          <div className="settings-content">
            <p>Settings go here</p>
            {/* You can add toggle switches, dropdowns, etc. */}
          </div>
        )}
      </motion.header>

      <main>
        <div className="map-container">
          <MapView />
        </div>
      </main>
    </div>
  );
}

export default App;
