import React, { useState, useEffect } from 'react';
import styles from './GoogleAuthSettings.module.css';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import StatusModal from '../common/StatusModal';

interface User {
    name: string;
    email: string;
}

const GoogleAuthSettings: React.FC = () => {
    const [clientId, setClientId] = useState('');
    const [clientSecret, setClientSecret] = useState('');
    const [showClientId, setShowClientId] = useState(false);
    const [showClientSecret, setShowClientSecret] = useState(false);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<User | null>(null);
    const [authUrl, setAuthUrl] = useState('');
    const [hasAuthConfig, setHasAuthConfig] = useState(false);

    const [statusModal, setStatusModal] = useState<{ show: boolean; message: string; type: 'success' | 'error' | 'info' }>({
        show: false,
        message: '',
        type: 'info'
    });

    const fetchUser = async () => {
        try {
            const res = await fetch('/api/auth/user');
            const userData = await res.json();
            setUser(userData);
        } catch (error) {
            console.error("Failed to fetch user", error);
            setUser(null);
        }
    };

    const fetchAuthUrl = async () => {
        try {
            const res = await fetch('/api/auth/google');
            const data = await res.json();
            setAuthUrl(data.url);
        } catch (error) {
            console.error("Failed to fetch auth URL", error);
        }
    };

    const fetchConfigStatus = async () => {
        try {
            const res = await fetch('/api/auth/config-status');
            const data = await res.json();
            setHasAuthConfig(data.hasConfig);
        } catch (error) {
            console.error("Failed to fetch config status", error);
        }
    };


    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            await Promise.all([
                fetchUser(),
                fetchConfigStatus(),
                fetch('/api/settings/google-auth')
                    .then(res => res.json())
                    .then(data => {
                        setClientId(data.clientId || '');
                        setClientSecret(data.clientSecret || '');
                        if (data.clientId) {
                            fetchAuthUrl();
                        }
                    })
                    .catch(err => console.error("Failed to fetch auth config", err))
            ]);
            setLoading(false);
        };

        fetchInitialData();

        const handleAuthMessage = (event: MessageEvent) => {
            if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
                setUser(event.data.user);
                window.location.reload();
            }
        };

        window.addEventListener('message', handleAuthMessage);
        return () => window.removeEventListener('message', handleAuthMessage);
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
                fetchConfigStatus();
                if (clientId) fetchAuthUrl();
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
                fetchConfigStatus();
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

    const handleSignIn = () => {
        if (authUrl) {
            const width = 600, height = 700;
            const left = (window.innerWidth / 2) - (width / 2);
            const top = (window.innerHeight / 2) - (height / 2);
            window.open(authUrl, 'GoogleAuth', `width=${width},height=${height},top=${top},left=${left}`);
        } else {
            setStatusModal({
                show: true,
                message: "Authentication URL not available. Ensure server is configured correctly.",
                type: 'error'
            });
        }
    };

    const handleSignOut = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            setUser(null);
            setStatusModal({ show: true, message: "Successfully signed out.", type: 'success' });
            window.location.reload();
        } catch (error) {
            console.error("Sign out failed", error);
            setStatusModal({ show: true, message: "Failed to sign out.", type: 'error' });
        }
    };


    if (loading) return <div>Loading Auth Settings...</div>;

    return (
        <div className={styles.container}>
            <h3 className={styles.title}>Google Authentication</h3>

            {user ? (
                <div className={styles.userInfo}>
                    <p>Signed in as: <strong>{user.name}</strong> ({user.email})</p>
                    <button className="btn-danger" onClick={handleSignOut}>Sign Out</button>
                </div>
            ) : (
                <div className={styles.signIn}>
                    <p>Sign in with your Google account to enable synchronization features.</p>
                    <button
                        className="btn-primary"
                        onClick={handleSignIn}
                        disabled={!hasAuthConfig}
                        title={!hasAuthConfig ? "Google Auth is not configured on the server." : "Sign in with Google"}
                    >
                        Sign in with Google
                    </button>
                    {!hasAuthConfig && <p className={styles.warning}>Google authentication is not configured. Please set up Client ID and Secret below.</p>}
                </div>
            )}

            <hr className={styles.hr} />

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