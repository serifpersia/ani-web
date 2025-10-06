import React, { useState, useEffect } from 'react';
import GenericModal from './GenericModal';

interface RemoveConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: { removeFromWatchlist?: boolean; rememberPreference?: boolean }) => void;
  animeName: string;
  scenario: 'continueWatching' | 'watchlist';
}

const RemoveConfirmationModal: React.FC<RemoveConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  animeName,
  scenario,
}) => {
  const [rememberPreference, setRememberPreference] = useState(false);
  const [removeFromWatchlist, setRemoveFromWatchlist] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setRememberPreference(false);
      setRemoveFromWatchlist(false);
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirm({
      removeFromWatchlist: scenario === 'continueWatching' ? removeFromWatchlist : true,
      rememberPreference: scenario === 'watchlist' ? rememberPreference : undefined,
    });
  };

  const title = scenario === 'continueWatching' ? 'Reset Progress' : 'Remove from Watchlist';
  const message = scenario === 'continueWatching'
    ? `Are you sure you want to remove your watch progress for "${animeName}"?`
    : `Are you sure you want to remove "${animeName}" from your watchlist?`;

  return (
    <GenericModal isOpen={isOpen} onClose={onClose} title={title}>
      <div>
        <p>{message}</p>
        {scenario === 'continueWatching' && (
          <div style={{ margin: '1rem 0' }}>
            <label>
              <input
                type="checkbox"
                checked={removeFromWatchlist}
                onChange={(e) => setRemoveFromWatchlist(e.target.checked)}
              />
              &nbsp;Also remove from my watchlist
            </label>
          </div>
        )}
        {scenario === 'watchlist' && (
          <div style={{ margin: '1rem 0' }}>
            <label>
              <input
                type="checkbox"
                checked={rememberPreference}
                onChange={(e) => setRememberPreference(e.target.checked)}
              />
              &nbsp;Remember my choice
            </label>
          </div>
        )}
        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button className="btn-secondary" onClick={onClose}>
            No
          </button>
          <button className="btn-danger" onClick={handleConfirm}>
            Yes
          </button>
        </div>
      </div>
    </GenericModal>
  );
};

export default RemoveConfirmationModal;