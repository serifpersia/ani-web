import React, { useState, useEffect } from 'react';
import styles from './GoogleAuthSettings.module.css';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import StatusModal from '../common/StatusModal';

const GoogleAuthSettings: React.FC = () => {
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [showClientId, setShowClientId] = useState(false);
    const [showClientSecret, setShowClientSecret] = useState(false);
    const [loading, setLoading] = useState(true);
    const [statusModal, setStatusModal] = useState<{ show: boolean; message: string; type: 'success' | 'error' | 'info' }>({
        show: false,
        message: '',
        type: 'info'
    });

    useEffect(() => {
        fetch('/api/settings/google-auth')
        .then(res => res.json())
        .then(data => {
            setClientId(data.clientId || '');
            setClientSecret(data.clientSecret || '');
            setLoading(false);
        })
        .catch(err => {
            console.error("Failed to fetch auth config", err);
            setLoading(false);
        });
    }, []);

    const handleSave = async () => {
        try {
            const res = await fetch('/api/settings/google-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, clientSecret })
            });

            if (res.ok) {
                setStatusModal({
                    show: true,
                    message: "Configuration saved successfully. You must restart the server for these changes to take effect.",
                    type: 'success'
                });
            } else {
                throw new Error("Failed to save");
            }
        } catch (error) {
            setStatusModal({
                show: true,
                message: "Failed to save configuration.",
                type: 'error'
            });
        }
    };

    const handleClear = async () => {
        setClientId('');
        setClientSecret('');
        try {
            const res = await fetch('/api/settings/google-auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: '', clientSecret: '' })
            });

            if (res.ok) {
                setStatusModal({
                    show: true,
                    message: "Configuration cleared successfully. You must restart the server for these changes to take effect.",
                    type: 'success'
                });
            } else {
                throw new Error("Failed to clear");
            }
        } catch (error) {
            setStatusModal({
                show: true,
                message: "Failed to clear configuration.",
                type: 'error'
            });
        }
    };

    if (loading) return <div>Loading Auth Settings...</div>;

    return (
        <div className={styles.container}>
        <h3 className={styles.title}>Google Authentication</h3>

        <div className={styles.formGroup}>
        <label className={styles.label}>Client ID</label>
        <div className={styles.inputWrapper}>
        <input
        type={showClientId ? "text" : "password"}
        className={styles.input}
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        placeholder="Enter Google Client ID"
        />
        <button className={styles.iconButton} onClick={() => setShowClientId(!showClientId)}>
        {showClientId ? <FaEyeSlash /> : <FaEye />}
        </button>
        </div>
        </div>

        <div className={styles.formGroup}>
        <label className={styles.label}>Client Secret</label>
        <div className={styles.inputWrapper}>
        <input
        type={showClientSecret ? "text" : "password"}
        className={styles.input}
        value={clientSecret}
        onChange={(e) => setClientSecret(e.target.value)}
        placeholder="Enter Google Client Secret"
        />
        <button className={styles.iconButton} onClick={() => setShowClientSecret(!showClientSecret)}>
        {showClientSecret ? <FaEyeSlash /> : <FaEye />}
        </button>
        </div>
        </div>

        <div className={styles.actions}>
        <button className="btn-primary" onClick={handleSave}>Save Config</button>
        <button className="btn-secondary" onClick={handleClear}>Clear Config</button>
        </div>

        <StatusModal
        show={statusModal.show}
        message={statusModal.message}
        type={statusModal.type}
        onClose={() => setStatusModal(prev => ({ ...prev, show: false }))}
        />
        </div>
    );
};

export default GoogleAuthSettings;
