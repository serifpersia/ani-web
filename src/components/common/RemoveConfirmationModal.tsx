import React from 'react';
import StatusModal from './StatusModal';

interface RemoveConfirmationModalProps {
  show: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const RemoveConfirmationModal: React.FC<RemoveConfirmationModalProps> = ({
  show,
  message,
  onConfirm,
  onCancel,
}) => {
  return (
    <StatusModal
      show={show}
      message={message}
      type="info"
      onClose={onCancel}
      showConfirmButton={true}
      onConfirm={onConfirm}
      confirmButtonText="Yes"
      cancelButtonText="No"
    />
  );
};

export default RemoveConfirmationModal;
