import React from 'react';
import RcloneSync from '../components/RcloneSync/RcloneSync';

const Settings: React.FC = () => {
  return (
    <div className="page-container">
      <h2 className="section-title">Settings</h2>
      <RcloneSync />
    </div>
  );
};

export default Settings;