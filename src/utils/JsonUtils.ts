import * as fs from 'fs';
import { createLogger, LogLevel } from './logUtils';

const log = createLogger({
    serviceName: 'JsonUtils',
    minLevel: LogLevel.INFO
});

export async function saveJsonToFile(filePath: string, data: any): Promise<void> {
    try {
        const jsonData = JSON.stringify(data, null, 2);
        await fs.promises.writeFile(filePath, jsonData);
        log.info('File saved successfully:', filePath);
    } catch (error) {
        log.error('Error saving file:', filePath, error);
        throw error;
    }
}

export async function readJsonFromFile(filePath: string): Promise<any | null> {
    try {
        if (!fs.existsSync(filePath)) {
            log.warn('File does not exist:', filePath);
            return null;
        }
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        log.debug('File read successfully:', filePath);
        return data;
    } catch (error) {
        log.error('Error reading file:', filePath, error);
        throw error;
    }
}