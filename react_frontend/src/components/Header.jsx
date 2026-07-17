import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Switch from '@mui/material/Switch';
import { FaCog } from 'react-icons/fa';
import './Header.css';

const barClasses = ['RD', 'OR', 'BL', 'YL', 'GR', 'SV'];

export default function Header({ settingsOpen, setSettingsOpen, isDC, setCity }) {
  const isNYC = !isDC;

  return (
    <motion.header
      className="header"
      animate={{ height: settingsOpen ? '100%' : '15vh' }}
      transition={{ duration: 0.4 }}
      style={{ overflow: 'hidden', position: 'relative' }}
    >
      <div className="bars-container">
        {barClasses.map((cls, i) => (
          <motion.div
            key={cls}
            className={cls}
            initial={{ height: isNYC ? '100%' : 0 }}
            animate={{ height: isNYC ? 0 : '100%' }}
            transition={{
              delay: i * 0.1,
              duration: 0.4,
              ease: 'easeOut'
            }}
          />
        ))}
      </div>

      <motion.div
        className="header-text-container"
        animate={{
          opacity: settingsOpen ? 0 : 1,
          y: settingsOpen ? 20 : 0
          
        }}
        transition={{ duration: 0.4 }}
      >
        <AnimatePresence>
          {isNYC && (
            <motion.div
              className="nyc-arrow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              {/* MTA-style wayfinding arrow: shaft plus two head lines, hard edges, pointing SE */}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M2.5 2.5L20 20" />
                <polyline points="21.5,10 21.5,21.5 10,21.5" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="dc-float">{isNYC ? 'NYC' : 'DC'}</div>
        <div className="header-text">LocalGuessr</div>
      </motion.div>

      {/* Gear Button */}
      <button className="settings-button" onClick={() => setSettingsOpen(prev => !prev)}>
        <FaCog />
      </button>


      {/* Settings Panel */}
      <AnimatePresence>
        {settingsOpen && (
          <motion.div
            className="settings-pane"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <h2>Settings</h2>
            <div className="city-question">Which city?</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontWeight: isDC ? 'bold' : 'normal', opacity: isDC ? 1 : 0.5 }}>DC</span>
              <Switch
                checked={isNYC}
                onChange={() => setCity(prev => !prev)}
              />
              <span style={{ fontWeight: isNYC ? 'bold' : 'normal', opacity: isNYC ? 1 : 0.5 }}>NYC</span>
            </label>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
