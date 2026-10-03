// Toggle - a small on/off switch (a styled checkbox). Used in the admin setup
// panel for the DC/NYC city picker, the team-size handicap and the practice
// round. Replaced Material UI's Switch, which was the only thing pulling the
// whole MUI + emotion libraries into the bundle.
import React from 'react';

export default function Toggle({ checked, onChange }) {
  return (
    <span className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} />
      <span className="toggle-track" aria-hidden="true" />
    </span>
  );
}
