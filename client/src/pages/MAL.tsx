import React, { useState } from 'react';
import { useSidebar } from '../hooks/useSidebar';
import styles from './MAL.module.css';

const MAL: React.FC = () => {
  const { setIsOpen } = useSidebar();

  React.useEffect(() => {
    document.title = 'MyAnimeList Import - ani-web';
  }, []);

  const [importStatus, setImportStatus] = useState<string>('');
  const [eraseWatchlist, setEraseWatchlist] = useState<boolean>(false);

  const handleMalImport = async () => {
    const fileInput = document.getElementById('malFile') as HTMLInputElement;
    if (!fileInput.files || fileInput.files.length === 0) {
      setImportStatus('Please select a file first.');
      return;
    }

    const file = fileInput.files[0];
    setImportStatus('Importing...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const response = await fetch('/api/import/mal-xml', {
          method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },          body: JSON.stringify({
            xml: e.target?.result,
            erase: eraseWatchlist,
          }),
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Failed to import watchlist.');
        }

        setImportStatus(`Import complete! Imported: ${result.imported}, Skipped: ${result.skipped}.`);
        setIsOpen(false);

      } catch (error: unknown) {
        setImportStatus(`Error: ${(error as Error).message}`);
      }
    };
    reader.onerror = () => {
      setImportStatus('Error reading file.');
    };
    reader.readAsText(file);
  };

  return (
    <div className={styles.malPage}>
      <h2>MAL Import</h2>

      <section className={styles.importSection}>
        <h3>Import from MyAnimeList</h3>
        <div className={styles.importControls}>
          <input type="file" id="malFile" accept=".xml,application/xml" aria-label="Import MyAnimeList file" />
          <button onClick={handleMalImport}>Import from File</button>
        </div>
        <div className={styles.importOptions}>
          <input
            type="checkbox"
            id="eraseWatchlistToggle"
            checked={eraseWatchlist}
            onChange={(e) => setEraseWatchlist(e.target.checked)}
            aria-label="Erase current watchlist before import"
          />
          <label htmlFor="eraseWatchlistToggle">Erase current watchlist before import</label>
        </div>
        {importStatus && <p className={styles.statusMessage}>{importStatus}</p>}
      </section>
    </div>
  );
};

export default MAL;
