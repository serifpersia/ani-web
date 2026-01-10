"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG = exports.SERVER_ROOT = void 0;
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const isDist = __dirname.endsWith('dist');
exports.SERVER_ROOT = isDist ? path_1.default.resolve(__dirname, '..') : path_1.default.resolve(__dirname);
dotenv_1.default.config({ path: path_1.default.join(exports.SERVER_ROOT, '.env') });
const IS_DEV = process.argv.includes('--dev');
const PORT = 3000;
const GOOGLE_REDIRECT_URI = IS_DEV
    ? 'http://localhost:5173/api/auth/google/callback'
    : `http://localhost:${PORT}/api/auth/google/callback`;
exports.CONFIG = {
    ROOT: exports.SERVER_ROOT,
    ENV_PATH: path_1.default.join(exports.SERVER_ROOT, '.env'),
    TOKEN_PATH: path_1.default.join(exports.SERVER_ROOT, 'google_tokens.json'),
    TEMP_MANIFEST_PATH: path_1.default.join(exports.SERVER_ROOT, 'sync_manifest.temp.json'),
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
