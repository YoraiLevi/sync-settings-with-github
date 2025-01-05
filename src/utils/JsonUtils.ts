import { log } from 'console';
import * as fs from 'fs';

export async function saveJsonToFile(filePath: string, data: any): Promise<void> {
    try {
        const jsonData = JSON.stringify(data, null, 2);
        await fs.promises.writeFile(filePath, jsonData);
        log(`${filePath} saved to file`);
    } catch (error) {
        log(`Error saving ${filePath} to file:`, error);
        throw error;
    }
}
export async function readJsonFromFile(filePath: string): Promise<any | null> {
    try {
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        log('Read', filePath, data);
        return data;
    } catch (error) {
        log('Error reading', filePath, error);
        throw error;
    }
}