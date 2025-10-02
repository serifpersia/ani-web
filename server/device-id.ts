import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger';

const DEVICE_ID_PATH = path.join(__dirname, '..', 'device_id.json');
let deviceId: string;

export async function getDeviceId(): Promise<string> {
    if (deviceId) return deviceId;
    try {
        const content = await fs.readFile(DEVICE_ID_PATH, 'utf-8');
        const data = JSON.parse(content);
        if (!data.id) throw new Error('Invalid device_id.json format');
        deviceId = data.id;
        logger.info(`Device ID loaded: ${deviceId}`);
    } catch (error) {
        deviceId = uuidv4();
        await fs.writeFile(DEVICE_ID_PATH, JSON.stringify({ id: deviceId }), 'utf-8');
        logger.info(`New Device ID generated and saved: ${deviceId}`);
    }
    return deviceId;
}