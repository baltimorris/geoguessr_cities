import React from 'react';
import { motion } from 'framer-motion';
import './SettingsPanel.css';

const panelVariants = {
  hidden: { opacity: 0, y: -20 },
  visible: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

function SettingsPanel() {
  return (
    <motion.div
      className="settings-content"
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      transition={{ delay: 0.5, duration: 0.3 }}
    >
      <p>Settings go here</p>
      {/* Add your toggles, dropdowns, etc. here */}
    </motion.div>
  );
}

export default SettingsPanel;
