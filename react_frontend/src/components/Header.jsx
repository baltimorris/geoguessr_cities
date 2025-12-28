import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Switch from '@mui/material/Switch';
import { FaCog, FaArrowDown } from 'react-icons/fa';
import './Header.css';

const barClasses = ['RD', 'OR', 'BL', 'YL', 'GR', 'SV'];

export default function Header({ settingsOpen, setSettingsOpen }) {
  const [isNYC, setIsNYC] = useState(false);

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
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Switch
                checked={isNYC}
                onChange={() => setIsNYC(prev => !prev)}
              />
              NYC Mode (Reverse Bars)
            </label>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
