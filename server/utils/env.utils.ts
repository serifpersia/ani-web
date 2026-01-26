import fs from 'fs';
import { CONFIG } from '../config';

export async function updateEnvFile(updates: Record<string, string>) {
    const envPath = CONFIG.ENV_PATH;

    let envContent = '';
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf8');
    }

    const lines = envContent.split('\n');
    const newLines = [...lines];

    Object.entries(updates).forEach(([key, value]) => {
        let found = false;
        for (let i = 0; i < newLines.length; i++) {
            if (newLines[i].startsWith(`${key}=`)) {
                if (value === '') {
                    newLines.splice(i, 1);
                    i--;
                } else {
                    newLines[i] = `${key}=${value}`;
                }
                found = true;
                break;
            }
        }
        if (!found && value !== '') {
            newLines.push(`${key}=${value}`);
        }
    });

    const finalContent = newLines.join('\n').replace(/\n{2,}/g, '\n').trim() + '\n';
    fs.writeFileSync(envPath, finalContent);
}