import React from 'react';
import styles from './StatusModal.module.css';

interface StatusModalProps {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const StatusModal: React.FC<StatusModalProps> = ({ show, message, type, onClose }) => {
  if (!show) {
    return null;
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={`${styles.modalContent} ${styles[type]}`}>
        <p className={styles.message}>{message}</p>
        <div className={styles.modalActions}>
          <button className="btn-primary" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
};

export default StatusModal;
