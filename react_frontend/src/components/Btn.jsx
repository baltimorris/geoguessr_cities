import React from 'react';

// One button style for the whole app: a chunky pressable "metro" button that
// depresses when tapped. Replaces the generic Material buttons.
export default function Btn({ variant = 'primary', className = '', ...props }) {
  return <button className={`btn btn-${variant} ${className}`} {...props} />;
}
