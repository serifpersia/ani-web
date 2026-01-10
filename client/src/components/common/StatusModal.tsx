import React from 'react';
import ReactDOM from 'react-dom';
import styles from './StatusModal.module.css';

interface StatusModalProps {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
  showConfirmButton?: boolean;
  onConfirm?: () => void;
  confirmButtonText?: string;
  cancelButtonText?: string;
}

const StatusModal: React.FC<StatusModalProps> = ({
  show,
  message,
  type,
  onClose,
  showConfirmButton = false,
  onConfirm,
  confirmButtonText = 'Confirm',
  cancelButtonText = 'Cancel',
}) => {
  if (!show) {
    return null;
  }

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay}>
    <div className={`${styles.modalContent} ${styles[type]}`}>
    <p className={styles.message}>{message}</p>
    <div className={styles.modalActions}>
    {showConfirmButton ? (
      <>
      <button className="btn-danger" onClick={onConfirm}>
      {confirmButtonText}
      </button>
      <button className="btn-primary" onClick={onClose}>
      {cancelButtonText}
      </button>
      </>
    ) : (
      <button className="btn-primary" onClick={onClose}>OK</button>
    )}
    </div>
    </div>
    </div>,
    document.body
  );
};

export default StatusModal;
