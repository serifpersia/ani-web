import React, { useState } from 'react';
import styles from './RcloneSync.module.css';
import StatusModal from '../common/StatusModal';

const RcloneSync: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [modalMessage, setModalMessage] = useState<string>('');
  const [modalType, setModalType] = useState<'success' | 'error' | 'info'>('info');

  const handleRcloneUpload = async () => {
    setLoading(true);
    setModalMessage('Uploading database...');
    setModalType('info');
    setShowModal(true);
    try {
      const response = await fetch('/api/rclone-upload', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to upload database.');
      }
      setModalMessage('Database uploaded successfully.');
      setModalType('success');
    } catch (error: unknown) {
      if (error instanceof Error) {
        setModalMessage(`Upload failed: ${error.message}`);
      } else {
        setModalMessage('Upload failed: An unknown error occurred.');
      }
      setModalType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleRcloneDownload = async () => {
    setLoading(true);
    setModalMessage('Downloading database...');
    setModalType('info');
    setShowModal(true);
    try {
      const response = await fetch('/api/rclone-download', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to download database.');
      }
      setModalMessage('Database downloaded successfully. Reloading page...');
      setModalType('success');
      setTimeout(() => window.location.reload(), 2000);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setModalMessage(`Download failed: ${error.message}`);
      } else {
        setModalMessage('Download failed: An unknown error occurred.');
      }
      setModalType('error');
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMessage('');
  };

  return (
    <div className={styles.rcloneSyncSection}>
      <h3>Rclone Sync</h3>
      <p>Sync your database with your cloud storage using rclone.</p>
      <div className={styles.rcloneSyncControls}>
        <button onClick={handleRcloneDownload} disabled={loading} className="btn-primary">
          {loading && modalMessage.startsWith('Downloading') ? 'Downloading...' : 'Download from Cloud'}
        </button>
        <button onClick={handleRcloneUpload} disabled={loading} className="btn-primary">
          {loading && modalMessage.startsWith('Uploading') ? 'Uploading...' : 'Upload to Cloud'}
        </button>
      </div>

      <StatusModal
        show={showModal}
        message={modalMessage}
        type={modalType}
        onClose={closeModal}
      />
    </div>
  );
};

export default RcloneSync;
