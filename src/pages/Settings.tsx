import React, { useState, useRef } from 'react';
import TitlePreferenceToggle from '../components/common/TitlePreferenceToggle';
import styles from './Settings.module.css';

import WatchlistSettings from '../components/settings/WatchlistSettings';

const Settings: React.FC = () => {
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setStatusMessage('Backing up database...');
    try {
      const response = await fetch('/api/backup-db');
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ani-web-backup.db';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setStatusMessage('Database backup successful!');
      } else {
        const errorData = await response.json();
        setStatusMessage(`Backup failed: ${errorData.error}`);
      }
    } catch (_error) {
      setStatusMessage('Backup failed: An unexpected error occurred.');
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setStatusMessage('Restoring database...');
    const formData = new FormData();
    formData.append('dbfile', file);

    try {
      const response = await fetch('/api/restore-db', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setStatusMessage(result.message || 'Database restored successfully!');
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setStatusMessage(`Restore failed: ${result.error}`);
      }
    } catch (_error) {
      setStatusMessage('Restore failed: An unexpected error occurred.');
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="page-container">
      <h2 className="section-title">Settings</h2>
      <div className={styles['settings-section']}>
        <TitlePreferenceToggle />
      </div>
      <WatchlistSettings />
      <div className={styles['settings-section']}>
        <h3>Database Backup and Restore</h3>
        <div className={styles.controls}>
          <button onClick={handleBackup} className="btn-primary">Backup Database</button>
          <button onClick={triggerFileSelect} className="btn-primary">Restore Database</button>
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleRestore}
          style={{ display: 'none' }}
          accept=".db"
        />
        {statusMessage && <p className={styles.status}>{statusMessage}</p>}
      </div>
    </div>
  );
};

export default Settings;