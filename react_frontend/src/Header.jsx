import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaCog } from 'react-icons/fa';
import './Header.css';

const barClasses = ['RD', 'OR', 'YL', 'GR', 'BL', 'SV'];

export default function Header({ settingsOpen, setSettingsOpen }) {
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
            initial={{ height: 0 }}
            animate={{ height: '100%' }}
            transition={{ delay: i * 0.1, duration: 0.4, ease: 'easeOut' }}
          />
        ))}
      </div>

      <motion.div
        className="header-text-container"
        animate={{ opacity: settingsOpen ? 0 : 1,
          y: settingsOpen ? 20 : 0
         }}
        transition={{ duration: 0.4 }}

      >
        <div className="dc-float">DC</div>
        <div className="header-text">LocalGuessr</div>
      </motion.div>
      {/* Gear Button */}
      <button className="settings-button" onClick={() => setSettingsOpen(prev => !prev)}>
        <FaCog />
      </button>

    </motion.header>
  );
}