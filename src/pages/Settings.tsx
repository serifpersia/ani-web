import React from 'react';
import TitlePreferenceToggle from '../components/common/TitlePreferenceToggle';
import styles from './Settings.module.css';

const Settings: React.FC = () => {

  return (
    <div className="page-container">
      <h2 className="section-title">Settings</h2>
      <div className={styles['settings-section']}>
        <TitlePreferenceToggle />
      </div>
    </div>
  );
};

export default Settings;
