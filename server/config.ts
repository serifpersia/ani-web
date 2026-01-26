import path from 'path';
import dotenv from 'dotenv';

const isDist = __dirname.endsWith('dist');

export const SERVER_ROOT = isDist ? path.resolve(__dirname, '..') : path.resolve(__dirname);

dotenv.config({ path: path.join(SERVER_ROOT, '.env') });

const IS_DEV = process.argv.includes('--dev');
const PORT = 3000;

const GOOGLE_REDIRECT_URI = IS_DEV
? 'http://localhost:5173/api/auth/google/callback'
: `http://localhost:${PORT}/api/auth/google/callback`;

export const CONFIG = {
    ROOT: SERVER_ROOT,
    ENV_PATH: path.join(SERVER_ROOT, '.env'),
    TOKEN_PATH: path.join(SERVER_ROOT, 'google_tokens.json'),
    TEMP_MANIFEST_PATH: path.join(SERVER_ROOT, 'sync_manifest.temp.json'),

    DB_NAME_PROD: 'anime.db',
    DB_NAME_DEV: 'anime.dev.db',

    REMOTE_FOLDER_PROD: 'aniweb_db',
    REMOTE_FOLDER_DEV: 'aniweb_dev_db',

    MANIFEST_FILENAME: 'sync_manifest.json',
    GOOGLE_SCOPES: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/userinfo.profile'
    ],

    IS_DEV,
    PORT,

    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: GOOGLE_REDIRECT_URI
};