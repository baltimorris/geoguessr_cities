import React from 'react';
import { useNavigate } from 'react-router-dom';

const RoleSelector = () => {
  const navigate = useNavigate();

  return (
    <div className="role-selector">
      <h1>Team Gussr</h1>
      <button onClick={() => navigate('/lobby', { state: { role: 'Gussr' } })}>
        I’m the Gussr
      </button>
      <button onClick={() => navigate('/lobby', { state: { role: 'Mappr' } })}>
        I’m a Mappr
      </button>
    </div>
  );
};

export default RoleSelector;
