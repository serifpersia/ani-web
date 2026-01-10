"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setActiveRemote = setActiveRemote;
exports.getActiveRemote = getActiveRemote;
exports.initialize = initialize;
exports.getRemoteString = getRemoteString;
const log = (message) => console.log(`[Sync Config] ${new Date().toISOString()} - ${message}`);
let activeRemote;
function setActiveRemote(remote) {
    log(`Setting active sync remote to: ${remote}`);
    activeRemote = remote;
}
function getActiveRemote() {
    return activeRemote;
}
async function initialize() {
    if (activeRemote !== 'gdrive') {
        log('Active remote is not gdrive, skipping gdrive-specific initialization.');
        return;
    }
    log('gdrive is the active remote.');
}
function getRemoteString(remoteDir) {
    if (!activeRemote) {
        throw new Error('Cannot get remote string: active remote is not set.');
    }
    return `${activeRemote}:${remoteDir}`;
}
